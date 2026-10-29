#!/usr/bin/env node
/** A bounded CAPTCHA window for the explicitly confirmed shared test project. */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessControlTestManagement as management, accessControlTestProject as testProject } from './lib/access-control-e2e-management.mjs';

const script = fileURLToPath(import.meta.url);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadEnvironment() {
  for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
}

const fingerprint = config => createHash('sha256').update(JSON.stringify([config.security_captcha_provider, config.security_captcha_secret])).digest('hex');

async function waitForCaptchaState(projectRef, enabled, expectedFingerprint, intervalMs) {
  let stableReads = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const actual = await management(projectRef, '/config/auth', 'GET');
    if (actual.security_captcha_enabled === enabled && fingerprint(actual) === expectedFingerprint) stableReads += 1;
    else stableReads = 0;
    if (stableReads === 3) return actual;
    if (attempt < 39) await pause(intervalMs);
  }
  throw new Error(`CAPTCHA ${enabled ? 'restoration' : 'disable'} did not become stable`);
}

export async function restoreCaptcha(directory, intervalMs = 1000) {
  const path = join(directory, 'captcha-restore.json');
  if (!existsSync(path)) return;
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  if (snapshot.projectRef !== testProject || typeof snapshot.enabled !== 'boolean') throw new Error('Invalid CAPTCHA recovery journal');
  // Always reassert the snapshot: Management API writes may propagate after a
  // stale GET, so observing the original value once does not prove restoration.
  await management(snapshot.projectRef, '/config/auth', 'PATCH', { security_captcha_enabled: snapshot.enabled });
  const actual = await waitForCaptchaState(snapshot.projectRef, snapshot.enabled, snapshot.fingerprint, intervalMs);
  writeFileSync(join(directory, 'captcha-restored.json'), JSON.stringify({ restored: true, enabled: actual.security_captcha_enabled, providerAndSecretUnchanged: true, restoredAt: new Date().toISOString() }), { mode: 0o600 });
  rmSync(path);
}

async function watchdog(directory) {
  const path = join(directory, 'captcha-restore.json');
  while (existsSync(path)) {
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    let parentAlive = true;
    try { process.kill(snapshot.parentPid, 0); } catch { parentAlive = false; }
    if (!parentAlive || Date.now() >= snapshot.restoreBy) {
      await restoreCaptcha(directory);
      return;
    }
    await pause(500);
  }
}

function startNode(args, env, options = {}) {
  return spawn(process.execPath, args, { env, stdio: 'inherit', ...options });
}

async function stop(child, group = false) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (group) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    if (group) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL');
  }
}

async function run() {
  loadEnvironment();
  const confirmed = process.argv[process.argv.indexOf('--confirm-test-project') + 1];
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0];
  if (!process.argv.includes('--confirm-test-project') || confirmed !== testProject || ref !== confirmed) throw new Error('Pass --confirm-test-project with the authorized test project ref');
  process.env.PORTAL_E2E_TEST_DB_CONFIRM = ref;
  const directory = mkdtempSync(join(tmpdir(), 'mywisata-access-control-'));
  const artifacts = process.env.PORTAL_E2E_ARTIFACTS ?? join(directory, 'evidence');
  mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  const baseURL = 'http://localhost:3001';
  const env = { ...process.env, PORTAL_E2E_TEST_DB_CONFIRM: ref, PORTAL_E2E_BASE_URL: baseURL,
    PORTAL_E2E_ARTIFACTS: artifacts, PORTAL_E2E_CAPTCHA_WINDOW: directory,
    NEXT_PUBLIC_SITE_URL: baseURL, STAFF_PASSKEY_ORIGIN: baseURL, MYWISATA_LOCAL_LEGACY_STAFF_AUTH: 'false',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  };
  let server;
  let browserTests;
  let monitor;
  let interrupted = false;
  const onSignal = () => { interrupted = true; browserTests?.kill('SIGTERM'); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    const discovered = startNode(['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.access-control.config.ts', '--list'], env);
    if (await new Promise(resolve => discovered.once('exit', resolve)) !== 0) throw new Error('Playwright test discovery failed before opening a CAPTCHA window');
    // Refuse an existing server: its CAPTCHA and strict-auth configuration is unknown.
    try { await fetch(baseURL, { signal: AbortSignal.timeout(500) }); throw new Error('The dedicated test port 3001 is already in use'); }
    catch (error) { if (error instanceof Error && error.message.includes('already in use')) throw error; }
    server = startNode(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3001'], env, { detached: true });
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (!ready && Date.now() < deadline && !interrupted) {
      try { ready = (await fetch(`${baseURL}/login`, { signal: AbortSignal.timeout(5000) })).ok; } catch { /* bounded readiness polling */ }
      if (!ready) await pause(500);
    }
    if (!ready || interrupted) throw new Error('Dedicated test server was not ready');
    const original = await management(ref, '/config/auth', 'GET');
    const snapshot = { projectRef: ref, enabled: original.security_captcha_enabled, fingerprint: fingerprint(original), parentPid: process.pid, restoreBy: Date.now() + 120_000 };
    if (typeof snapshot.enabled !== 'boolean') throw new Error('Original CAPTCHA state unavailable');
    writeFileSync(join(directory, 'captcha-restore.json'), JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
    // An independent process restores the original switch even if the runner is killed.
    startNode([script, '--captcha-watchdog', directory], env, { detached: true, stdio: 'ignore' }).unref();
    await management(ref, '/config/auth', 'PATCH', { security_captcha_enabled: false });
    await waitForCaptchaState(ref, false, snapshot.fingerprint, 1000);
    console.log('ACCESS_CONTROL_QA: Test-project CAPTCHA window opened; automatic restoration deadline is 120 seconds.');
    let restoring = false;
    monitor = setInterval(() => {
      if (restoring || !existsSync(join(directory, 'passwords-ready'))) return;
      restoring = true;
      void restoreCaptcha(directory).then(() => console.log('ACCESS_CONTROL_QA: Original CAPTCHA switch restored and verified before authorization testing.')).catch(() => browserTests?.kill('SIGTERM'));
    }, 250);
    browserTests = startNode(['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.access-control.config.ts', '--workers=1', '--retries=0', '--output', join(directory, 'private-test-results')], env);
    const exit = await new Promise(resolve => browserTests.once('exit', (code, signal) => resolve({ code, signal })));
    process.exitCode = exit.code === 0 && !interrupted ? 0 : 1;
  } finally {
    if (monitor) clearInterval(monitor);
    await stop(browserTests);
    try {
      await restoreCaptcha(directory);
      const receipt = join(directory, 'captcha-restored.json');
      if (existsSync(receipt)) writeFileSync(join(artifacts, 'captcha-restoration.json'), readFileSync(receipt), { mode: 0o600 });
    } finally {
      await stop(server, true);
      // Failure DOM snapshots can contain form secrets; keep only deliberately sanitized evidence.
      rmSync(join(directory, 'private-test-results'), { recursive: true, force: true });
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    }
    console.log(`ACCESS_CONTROL_QA: Sanitized evidence directory: ${artifacts}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  loadEnvironment();
  const guard = process.argv.indexOf('--captcha-watchdog');
  const task = guard >= 0 ? watchdog(process.argv[guard + 1]) : run();
  task.catch(error => { console.error(error instanceof Error ? error.message : 'Access Control acceptance failed'); process.exitCode = 1; });
}
