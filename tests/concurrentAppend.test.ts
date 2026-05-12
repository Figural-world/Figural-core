import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonFile, writeJsonFile } from "../src/core/files.js";
import { withFileLock } from "../src/core/lock.js";
import { appendDecision, type FiguralLog } from "../src/core/log.js";

async function makeTempRepo(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "figural-test-"));
}

async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

test("concurrent appendDecision calls all persist with unique ids", async () => {
  const repoRoot = await makeTempRepo();
  const logPath = path.join(repoRoot, ".figural", "log.json");
  const lockPath = path.join(repoRoot, ".figural", "log.json.lock");

  try {
    const N = 50;

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        withFileLock(lockPath, async () => {
          const result = await appendDecision({
            logPath,
            input: {
              decision: `decision-${i}`,
              rationale: "concurrent test",
              confidence: 0.5,
              domain: "test",
              source: "agent"
            }
          });
          await writeJsonFile(logPath, result.updatedLog);
        })
      )
    );

    const log = await readJsonFile<FiguralLog>(logPath);
    assert.equal(log.decisions.length, N, `expected ${N} entries, got ${log.decisions.length}`);

    const ids = new Set(log.decisions.map((d) => d.id));
    assert.equal(ids.size, N, `expected ${N} unique ids, got ${ids.size}`);

    const decisions = new Set(log.decisions.map((d) => d.decision));
    assert.equal(decisions.size, N, "every distinct decision string should be persisted");
  } finally {
    await cleanup(repoRoot);
  }
});

test("appendDecision throws (does not silently reset) when log file is unparseable", async () => {
  const repoRoot = await makeTempRepo();
  const logPath = path.join(repoRoot, ".figural", "log.json");

  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, "{ this is not valid json", "utf8");

    await assert.rejects(
      appendDecision({
        logPath,
        input: {
          decision: "x",
          rationale: "y",
          confidence: 0.5,
          domain: "test"
        }
      }),
      /Refusing to overwrite existing history/
    );

    const raw = await fs.readFile(logPath, "utf8");
    assert.equal(raw, "{ this is not valid json", "log on disk must remain untouched");
  } finally {
    await cleanup(repoRoot);
  }
});

test("appendDecision starts a fresh log when the file is missing (ENOENT)", async () => {
  const repoRoot = await makeTempRepo();
  const logPath = path.join(repoRoot, ".figural", "log.json");

  try {
    const result = await appendDecision({
      logPath,
      input: {
        decision: "first",
        rationale: "bootstrap",
        confidence: 1,
        domain: "test"
      }
    });

    assert.equal(result.entry.id, 1);
    assert.equal(result.updatedLog.decisions.length, 1);
  } finally {
    await cleanup(repoRoot);
  }
});

test("writeJsonFile is atomic: never leaves a partial file", async () => {
  const repoRoot = await makeTempRepo();
  const filePath = path.join(repoRoot, ".figural", "log.json");

  try {
    const original = { schema_version: "1.0", decisions: [{ id: 1, msg: "keep me" }] };
    await writeJsonFile(filePath, original);

    const next = { schema_version: "1.0", decisions: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 })) };

    await Promise.all([writeJsonFile(filePath, next), writeJsonFile(filePath, next), writeJsonFile(filePath, next)]);

    const parsed = await readJsonFile<{ decisions: unknown[] }>(filePath);
    assert.ok(Array.isArray(parsed.decisions), "file must remain valid JSON after concurrent atomic writes");
  } finally {
    await cleanup(repoRoot);
  }
});

test("withFileLock serializes critical sections", async () => {
  const repoRoot = await makeTempRepo();
  const lockPath = path.join(repoRoot, ".figural", "test.lock");

  try {
    let inside = 0;
    let maxInside = 0;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        withFileLock(lockPath, async () => {
          inside++;
          maxInside = Math.max(maxInside, inside);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inside--;
        })
      )
    );

    assert.equal(maxInside, 1, "no two callers may execute the critical section concurrently");
  } finally {
    await cleanup(repoRoot);
  }
});
