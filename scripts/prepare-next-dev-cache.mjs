import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareNextDevCache } from "./lib/next-dev-cache.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = prepareNextDevCache({ repositoryRoot });
  const cacheMiB = (result.cacheBytes / 1024 ** 2).toFixed(1);

  if (result.skippedStaleNextLock) {
    console.warn("[next-cache] Found a stale Next development lock; skipped cleanup and continued to the Next runner.");
  } else if (result.cleanedOversizedCache) {
    const lockNote = result.preservedStripeLock ? " while preserving the active Stripe launcher lock" : "";
    console.log(`[next-cache] Cleaned an oversized .next cache (${cacheMiB} MiB)${lockNote}.`);
  } else if (result.removedTurbopack) {
    console.log(`[next-cache] Removed stale Turbopack data; kept ${cacheMiB} MiB of healthy cache.`);
  } else {
    console.log(`[next-cache] Cache is healthy (${cacheMiB} MiB); no cleanup needed.`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown cache preparation error.";
  console.error(`[next-cache] ${message}`);
  process.exitCode = 1;
}
