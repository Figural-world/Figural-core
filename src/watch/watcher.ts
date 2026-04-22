import chokidar from "chokidar";
import path from "node:path";

export type WatcherEvent = {
  path: string;
};

export type StartWatcherOpts = {
  repoRoot: string;
  onBatch: (changedPaths: string[]) => Promise<void> | void;
  debounceMs?: number;
};

export async function startWatcher(opts: StartWatcherOpts): Promise<{ close: () => Promise<void> }> {
  const ignore = [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/.figural/**",
    "**/.specpack.json"
  ];

  const debounceMs = opts.debounceMs ?? 1000;

  const changed = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(opts.repoRoot, {
    ignored: ignore,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 250,
      pollInterval: 50
    }
  });

  function enqueue(filePath: string): void {
    const rel = path.relative(opts.repoRoot, filePath);
    changed.add(rel);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const batch = [...changed];
      changed.clear();
      await opts.onBatch(batch);
    }, debounceMs);
  }

  watcher.on("add", enqueue);
  watcher.on("change", enqueue);
  watcher.on("unlink", enqueue);

  return {
    close: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    }
  };
}

