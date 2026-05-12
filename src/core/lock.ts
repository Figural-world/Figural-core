import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./files.js";

export type WithFileLockOptions = {
  /** Total time to wait for the lock before throwing. Default: 10_000ms. */
  timeoutMs?: number;
  /** Initial poll interval between retry attempts. Default: 25ms. */
  pollIntervalMs?: number;
  /** Treat existing lock files older than this as stale and steal them. Default: 30_000ms. */
  staleAfterMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 25;
const DEFAULT_STALE_AFTER_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    // EPERM means the process exists but we can't signal it; still alive.
    return code === "EPERM";
  }
}

async function tryAcquire(lockPath: string): Promise<boolean> {
  try {
    const handle = await fs.open(lockPath, "wx");
    try {
      await handle.writeFile(String(process.pid), "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EEXIST") return false;
    throw error;
  }
}

async function maybeStealStaleLock(lockPath: string, staleAfterMs: number): Promise<boolean> {
  let stat;
  try {
    stat = await fs.stat(lockPath);
  } catch {
    return false;
  }

  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs < staleAfterMs) {
    // Recent lock. Only steal it if we have positive proof its owner is dead.
    // If the PID file is empty (owner just opened the file but hasn't written
    // its pid yet) or unreadable, assume the owner is mid-acquire and wait.
    let pid: number;
    try {
      const raw = await fs.readFile(lockPath, "utf8");
      pid = Number.parseInt(raw.trim(), 10);
    } catch {
      return false;
    }

    if (!Number.isFinite(pid) || pid <= 0) return false;
    if (isProcessAlive(pid)) return false;
  }

  try {
    await fs.unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire a cross-process advisory lock for the duration of `fn`.
 *
 * Implementation notes:
 * - Uses an exclusive `O_CREAT | O_EXCL` open on `lockPath` (atomic on POSIX
 *   and NTFS), so two processes cannot both claim the lock.
 * - If the lock file already exists but the owning PID is dead, or the file
 *   is older than `staleAfterMs`, the stale lock is removed and retried.
 * - The lock is always released, even if `fn` throws.
 */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: WithFileLockOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  await ensureDir(path.dirname(lockPath));

  const start = Date.now();
  let acquired = false;

  while (!acquired) {
    acquired = await tryAcquire(lockPath);
    if (acquired) break;

    if (Date.now() - start >= timeoutMs) {
      const stolen = await maybeStealStaleLock(lockPath, staleAfterMs);
      if (stolen) continue;
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for lock at ${lockPath}. ` +
          `Another figural process may be holding it; if you believe it is dead, remove the file manually.`
      );
    }

    const stolen = await maybeStealStaleLock(lockPath, staleAfterMs);
    if (stolen) continue;

    await sleep(pollIntervalMs);
  }

  try {
    return await fn();
  } finally {
    await fs.unlink(lockPath).catch(() => {});
  }
}
