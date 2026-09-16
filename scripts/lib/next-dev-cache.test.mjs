import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const helperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "next-dev-cache.mjs");

async function loadHelper() {
  return import(pathToFileURL(helperPath).href);
}

function createRepository() {
  const repositoryRoot = mkdtempSync(path.join(os.tmpdir(), "mywisata-next-cache-"));
  const nextDirectory = path.join(repositoryRoot, ".next");
  mkdirSync(nextDirectory, { recursive: true });
  test.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  return { nextDirectory, repositoryRoot };
}

function writeFixture(root, relativePath, contents = "cache") {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return target;
}

test("preserves a healthy Webpack cache", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");

  const result = prepareNextDevCache({ repositoryRoot, maxCacheBytes: 1024 });

  assert.equal(result.cleanedOversizedCache, false);
  assert.equal(result.removedTurbopack, false);
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("removes stale Turbopack data without deleting a healthy Webpack cache", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const turbopackEntry = writeFixture(nextDirectory, "dev/cache/turbopack/v16/cache.sst", "stale");
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");

  const result = prepareNextDevCache({ repositoryRoot, maxCacheBytes: 1024 });

  assert.equal(result.removedTurbopack, true);
  assert.equal(existsSync(turbopackEntry), false);
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("cleans oversized generated contents", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const oversizedEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "oversized");

  const result = prepareNextDevCache({ repositoryRoot, maxCacheBytes: 4 });

  assert.equal(result.cleanedOversizedCache, true);
  assert.equal(existsSync(oversizedEntry), false);
});

test("refuses to touch cache owned by a live Next development server", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");
  writeFixture(nextDirectory, "dev/lock", JSON.stringify({ pid: 4242, port: 3000 }));

  assert.throws(
    () => prepareNextDevCache({
      repositoryRoot,
      maxCacheBytes: 4,
      isProcessAlive: (pid) => pid === 4242,
    }),
    /already running/i,
  );
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("fails closed when the Next development lock is malformed", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");
  writeFixture(nextDirectory, "dev/lock", "not-json");

  assert.throws(
    () => prepareNextDevCache({ repositoryRoot, maxCacheBytes: 4 }),
    /lock/i,
  );
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("rejects a Next development lock whose PID contains trailing text", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");
  writeFixture(nextDirectory, "dev/lock", JSON.stringify({ pid: "4242junk", port: 3000 }));

  assert.throws(
    () => prepareNextDevCache({ repositoryRoot, maxCacheBytes: 4 }),
    /lock PID/i,
  );
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("rejects a Next development lock whose PID exceeds the safe integer range", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "warm");
  writeFixture(nextDirectory, "dev/lock", JSON.stringify({ pid: "9007199254740993", port: 3000 }));

  assert.throws(
    () => prepareNextDevCache({
      repositoryRoot,
      maxCacheBytes: 4,
      isProcessAlive: () => false,
    }),
    /lock PID/i,
  );
  assert.equal(readFileSync(webpackEntry, "utf8"), "warm");
});

test("skips cleanup without blocking startup when the Next lock owner is dead", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const webpackEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "oversized");
  const nextLock = writeFixture(nextDirectory, "dev/lock", JSON.stringify({ pid: 4242, port: 3000 }));

  const result = prepareNextDevCache({
    repositoryRoot,
    maxCacheBytes: 4,
    isProcessAlive: () => false,
  });

  assert.equal(result.skippedStaleNextLock, true);
  assert.equal(readFileSync(webpackEntry, "utf8"), "oversized");
  assert.equal(JSON.parse(readFileSync(nextLock, "utf8")).pid, 4242);
});

test("holds an exclusive Next cache guard until cleanup releases it", async () => {
  const { acquireNextCacheGuard } = await loadHelper();
  const { nextDirectory } = createRepository();
  const first = acquireNextCacheGuard({ nextDirectory, ownerPid: 7001 });

  assert.throws(
    () => acquireNextCacheGuard({
      nextDirectory,
      ownerPid: 7002,
      isProcessAlive: (pid) => pid === 7001,
    }),
    /already running/i,
  );
  assert.equal(JSON.parse(readFileSync(path.join(nextDirectory, "dev", "lock"), "utf8")).pid, 7001);

  first.release();
  assert.equal(existsSync(path.join(nextDirectory, "dev", "lock")), false);
});

test("preserves a live Stripe launcher lock during oversized cleanup", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const stripeLock = writeFixture(nextDirectory, "dev-stripe.lock", "5151\n");
  const oversizedEntry = writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "oversized");

  const result = prepareNextDevCache({
    repositoryRoot,
    maxCacheBytes: 4,
    isProcessAlive: (pid) => pid === 5151,
  });

  assert.equal(result.preservedStripeLock, true);
  assert.equal(readFileSync(stripeLock, "utf8"), "5151\n");
  assert.equal(existsSync(oversizedEntry), false);
});

test("leaves stale Stripe launcher lock recovery to the Stripe launcher", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const stripeLock = writeFixture(nextDirectory, "dev-stripe.lock", "6161\n");
  writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "oversized");

  const result = prepareNextDevCache({
    repositoryRoot,
    maxCacheBytes: 4,
    isProcessAlive: () => false,
  });

  assert.equal(result.preservedStripeLock, true);
  assert.equal(readFileSync(stripeLock, "utf8"), "6161\n");
});

test("preserves a malformed Stripe launcher lock during oversized cleanup", async () => {
  const { prepareNextDevCache } = await loadHelper();
  const { nextDirectory, repositoryRoot } = createRepository();
  const stripeLock = writeFixture(nextDirectory, "dev-stripe.lock", "5151junk\n");
  writeFixture(nextDirectory, "dev/cache/webpack/entry.pack", "oversized");

  const result = prepareNextDevCache({
    repositoryRoot,
    maxCacheBytes: 4,
    isProcessAlive: () => false,
  });

  assert.equal(result.preservedStripeLock, true);
  assert.equal(readFileSync(stripeLock, "utf8"), "5151junk\n");
});
