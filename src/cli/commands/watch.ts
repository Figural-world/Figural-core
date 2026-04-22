import path from "node:path";
import { appendDecision } from "../../core/log.js";
import { writeJsonFile } from "../../core/files.js";
import { runDriftCheck } from "../../watch/driftCheck.js";
import { startWatcher } from "../../watch/watcher.js";

export async function runWatch(opts: { cwd: string }): Promise<void> {
  const repoRoot = opts.cwd;
  const logPath = path.join(repoRoot, ".figural", "log.json");

  process.stdout.write("figural watch: watching for drift (Ctrl+C to stop)\n");

  try {
    await startWatcher({
      repoRoot,
      debounceMs: 1000,
      onBatch: async (changedPaths) => {
        const result = await runDriftCheck({ repoRoot, changedPaths });
        if (!result.drift) return;

        const decision = `Drift detected (severity: ${result.severity})`;
        const rationale =
          `Violations:\\n` +
          result.violations.map((v) => `- [${v.field}] ${v.spec_item}: ${v.evidence}`).join("\\n") +
          `\\n\\nRecommended action: ${result.recommended_action}`;

        process.stderr.write(`\\n${decision}\\n${rationale}\\n`);

        const appended = await appendDecision({
          logPath,
          input: {
            decision,
            rationale,
            confidence: 0.7,
            domain: "drift",
            source: "agent",
            context: {
              changed_paths: changedPaths,
              violations: result.violations,
              recommended_action: result.recommended_action
            }
          }
        });

        await writeJsonFile(logPath, appended.updatedLog);
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`figural watch failed to start: ${msg}\\n`);
    process.stderr.write("Fallback: run the manual /figural-watch prompt after significant work.\\n");
  }
}

