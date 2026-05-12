import path from "node:path";
import * as z from "zod";

import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";

import { readJsonFile, writeJsonFile } from "../core/files.js";
import { withFileLock } from "../core/lock.js";
import { appendDecision } from "../core/log.js";

export async function runMcpServer(opts: { cwd: string }): Promise<void> {
  const repoRoot = opts.cwd;
  const specPath = path.join(repoRoot, ".specpack.json");
  const logPath = path.join(repoRoot, ".figural", "log.json");
  const logLockPath = path.join(repoRoot, ".figural", "log.json.lock");

  const server = new McpServer({ name: "figural-core", version: "0.1.0" });

  server.registerTool(
    "figural_get_spec",
    {
      title: "Get Specpack",
      description: "Read the current .specpack.json from the repo.",
      inputSchema: z.object({})
    },
    async () => {
      const spec = await readJsonFile<Record<string, unknown>>(specPath);
      return {
        content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
        structuredContent: spec
      };
    }
  );

  server.registerTool(
    "figural_log_decision",
    {
      title: "Log Decision",
      description: "Append a decision to .figural/log.json with basic same-domain conflict marking.",
      inputSchema: z.object({
        decision: z.string().min(1),
        rationale: z.string().min(1),
        confidence: z.number().min(0).max(1),
        domain: z.string().min(1),
        source: z.enum(["human", "agent", "extension"]).optional(),
        evidence_refs: z.array(z.string()).optional(),
        context: z.any().optional()
      })
    },
    async (args) => {
      const result = await withFileLock(logLockPath, async () => {
        const appended = await appendDecision({
          logPath,
          input: args
        });
        await writeJsonFile(logPath, appended.updatedLog);
        return appended;
      });

      // Per PDF: return the new entry id.
      return {
        content: [{ type: "text", text: String(result.entry.id) }],
        structuredContent: { id: result.entry.id, entry: result.entry }
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

