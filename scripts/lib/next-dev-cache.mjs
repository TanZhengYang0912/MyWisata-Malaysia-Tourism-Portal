import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 ** 3;

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readPositivePid(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const source = String(value);
  if (!/^[1-9]\d*$/.test(source)) return null;
  const pid = Number(source);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function assertNotSymlink(pathname, label) {
  if (existsSync(pathname) && lstatSync(pathname).isSymbolicLink()) {
    throw new Error(`Refusing to clean ${label} because it is a symbolic link.`);
  }
}

function assertSafeNextTree(nextDirectory) {
  assertNotSymlink(nextDirectory, ".next");
  assertNotSymlink(path.join(nextDirectory, "dev"), ".next/dev");
  assertNotSymlink(path.join(nextDirectory, "dev", "cache"), ".next/dev/cache");
}

export function directorySize(pathname) {
  if (!existsSync(pathname)) return 0;

  const stats = lstatSync(pathname);
  if (!stats.isDirectory() || stats.isSymbolicLink()) return stats.size;

  return readdirSync(pathname).reduce(
    (total, entry) => total + directorySize(path.join(pathname, entry)),
    0,
  );
}

export function readLiveNextDevLock(lockPath, isProcessAlive = defaultIsProcessAlive) {
  if (!existsSync(lockPath)) return null;
  assertNotSymlink(lockPath, ".next/dev/lock");

  let value;
  try {
    value = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    throw new Error("Cannot safely inspect the Next development lock.");
  }

  const pid = readPositivePid(value?.pid);
  if (pid === null) {
    throw new Error("Cannot safely inspect the Next development lock PID.");
  }

  return { pid, alive: isProcessAlive(pid), token: typeof value.token === "string" ? value.token : null };
}

function cleanNextDirectory(nextDirectory) {
  for (const entry of readdirSync(nextDirectory)) {
    if (entry === "dev-stripe.lock") continue;
    if (entry === "dev") {
      const devDirectory = path.join(nextDirectory, entry);
      for (const devEntry of readdirSync(devDirectory)) {
        if (devEntry === "lock") continue;
        rmSync(path.join(devDirectory, devEntry), { recursive: true, force: true });
      }
      continue;
    }
    rmSync(path.join(nextDirectory, entry), { recursive: true, force: true });
  }
}

export function acquireNextCacheGuard({
  nextDirectory,
  ownerPid = process.pid,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const validatedOwnerPid = readPositivePid(ownerPid);
  if (typeof nextDirectory !== "string" || nextDirectory.length === 0 || validatedOwnerPid === null) {
    throw new Error("A valid Next directory and owner PID are required for the cache guard.");
  }

  const devDirectory = path.join(nextDirectory, "dev");
  mkdirSync(devDirectory, { recursive: true });
  const lockPath = path.join(devDirectory, "lock");
  const token = randomUUID();
  let descriptor;

  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify({ pid: validatedOwnerPid, cacheGuard: true, token }), "utf8");
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      descriptor = undefined;
      rmSync(lockPath, { force: true });
    }

    if (error?.code !== "EEXIST") throw error;
    const existing = readLiveNextDevLock(lockPath, isProcessAlive);
    if (existing?.alive) {
      throw new Error(`Next development server is already running with PID ${existing.pid}.`);
    }
    return {
      acquired: false,
      stalePid: existing.pid,
      release() {},
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  let released = false;
  return {
    acquired: true,
    stalePid: null,
    release() {
      if (released) return;
      released = true;
      if (!existsSync(lockPath)) return;

      const current = readLiveNextDevLock(lockPath, isProcessAlive);
      if (current?.pid === validatedOwnerPid && current.token === token) {
        rmSync(lockPath, { force: true });
      }
    },
  };
}

export function prepareNextDevCache({
  repositoryRoot,
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) {
    throw new Error("A repository root is required for Next cache cleanup.");
  }
  if (!Number.isSafeInteger(maxCacheBytes) || maxCacheBytes < 0) {
    throw new Error("The Next cache size limit must be a non-negative safe integer.");
  }

  const nextDirectory = path.join(path.resolve(repositoryRoot), ".next");
  const result = {
    cacheBytes: 0,
    cleanedOversizedCache: false,
    preservedStripeLock: false,
    removedTurbopack: false,
    skippedStaleNextLock: false,
  };

  if (!existsSync(nextDirectory)) return result;
  assertSafeNextTree(nextDirectory);
  const guard = acquireNextCacheGuard({ nextDirectory, isProcessAlive });
  if (!guard.acquired) {
    result.skippedStaleNextLock = true;
    return result;
  }

  try {
    const turbopackDirectory = path.join(nextDirectory, "dev", "cache", "turbopack");
    if (existsSync(turbopackDirectory)) {
      assertNotSymlink(turbopackDirectory, ".next/dev/cache/turbopack");
      rmSync(turbopackDirectory, { recursive: true, force: true });
      result.removedTurbopack = true;
    }

    result.cacheBytes = directorySize(nextDirectory);
    if (result.cacheBytes > maxCacheBytes) {
      cleanNextDirectory(nextDirectory);
      result.cleanedOversizedCache = true;
    }

    result.preservedStripeLock = existsSync(path.join(nextDirectory, "dev-stripe.lock"));
    return result;
  } finally {
    guard.release();
  }
}
