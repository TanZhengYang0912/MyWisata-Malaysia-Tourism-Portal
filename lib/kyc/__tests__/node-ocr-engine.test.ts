import { afterEach, expect, it, vi } from 'vitest';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtemp, mkdir, copyFile, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { extractKycFieldsInNode, parseNodeKycOcrOutcome } from '../node-ocr-engine';

const image = { mimeType: 'image/png', bytes: new Uint8Array([1, 2]) };
afterEach(() => vi.unstubAllEnvs());
it('rejects malformed evidence without reflecting bytes or environment', async () => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sentinel-never-in-child');
  const result = await extractKycFieldsInNode({ documentType: 'national_id', front: image, back: image }, 2000);
  expect(result).toMatchObject({ ok: false, failureCode: 'evidence_invalid', retryable: false });
  expect(JSON.stringify(result)).not.toContain('sentinel');
});
it('terminates a timed-out real child before accepting another call', async () => {
  expect(await extractKycFieldsInNode({ documentType: 'national_id', front: image, back: image }, 1))
    .toMatchObject({ ok: false, failureCode: 'timeout' });
  expect(await extractKycFieldsInNode({ documentType: 'national_id', front: image, back: image }, 2000))
    .toMatchObject({ failureCode: 'evidence_invalid' });
});
it('rejects local reentry while the first child is owned', async () => {
  const first = extractKycFieldsInNode({ documentType: 'national_id', front: image, back: image }, 2000);
  expect(await extractKycFieldsInNode({ documentType: 'national_id', front: image, back: image }, 2000))
    .toMatchObject({ failureCode: 'service_unavailable' });
  await first;
});
it('child exits when the parent IPC connection disappears', async () => {
  const child = fork(resolve('lib/kyc/runtime/tesseract-process.cjs'), [], { env: { NODE_ENV: 'production' }, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const closed = once(child, 'exit');
  await once(child, 'spawn');
  child.disconnect();
  expect((await closed)[0]).toBe(1);
});
it('rejects malformed IPC and removes unknown metadata before returning it', () => {
  expect(parseNodeKycOcrOutcome({ ok: true, fields: {}, metrics: { secret: 'never' } })).toMatchObject({ failureCode: 'invalid_response' });
  const result = parseNodeKycOcrOutcome({ ok: true, fields: { holderName: null, documentNumber: null, confidence: null, expiryDate: null, unreadable: true, rawText: 'never' },
    metrics: { initializationMs: 1, childRssBytes: 1, cpu: { user: 1, system: 1 }, internalPath: '/never', manifest: { engine: 'tesseract-js-7.0.0-v1', version: '7.0.0', coreVersion: '7.0.0',
      models: ['eng', 'msa', 'chi_sim'].map(code => ({ code, version: '1.0.0', sha256: 'a'.repeat(64), path: '/never' })) } } });
  expect(result.ok).toBe(true); expect(JSON.stringify(result)).not.toMatch(/never|rawText|internalPath/);
  if (result.ok) {
    expect(parseNodeKycOcrOutcome({ ...result, fields: { ...result.fields, visualComparisonStatus: 'consistent' } }))
      .toMatchObject({ ok: false, failureCode: 'invalid_response' });
    expect(parseNodeKycOcrOutcome({ ...result, metrics: { ...result.metrics, recognitionPasses: 9 } }))
      .toMatchObject({ ok: false, failureCode: 'invalid_response' });
  }
});
it('does not leave a child alive after its actual parent is SIGKILLed', async () => {
  const parent = spawn(process.execPath, ['-e', `const {fork}=require('node:child_process');const c=fork(process.argv[1],[],{env:{NODE_ENV:'production'},execArgv:[],stdio:['ignore','ignore','ignore','ipc']});c.once('spawn',()=>process.send(c.pid));process.on('message',()=>{});`, resolve('lib/kyc/runtime/tesseract-process.cjs')],
    { env: { NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const [pid] = await once(parent, 'message') as [number];
  const exited = once(parent, 'exit');
  parent.kill('SIGKILL'); await exited;
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  for (let attempt = 0; attempt < 150 && alive(); attempt += 1) await sleep(20);
  const residual = alive();
  if (residual) process.kill(pid, 'SIGKILL');
  expect(residual).toBe(false);
}, 5000);
it('fails closed for a missing packaged model without downloading a replacement', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'kyc-missing-model-'));
  let child: ReturnType<typeof fork> | undefined;
  try {
    await mkdir(resolve(root, 'node_modules/@tesseract.js-data/eng'), { recursive: true });
    for (const name of ['tesseract-process.cjs', 'tesseract-worker.cjs', 'ocr-fields.cjs']) await copyFile(resolve('lib/kyc/runtime', name), resolve(root, name));
    for (const name of ['sharp', 'tesseract.js', 'tesseract.js-core']) await symlink(resolve('node_modules', name), resolve(root, 'node_modules', name));
    await writeFile(resolve(root, 'node_modules/@tesseract.js-data/eng/package.json'), '{"version":"1.0.0"}');
    const bytes = new Uint8Array(await sharp({ create: { width: 30, height: 20, channels: 3, background: '#fff' } }).png().toBuffer());
    child = fork(resolve(root, 'tesseract-process.cjs'), [], { env: { NODE_ENV: 'production' }, execArgv: [], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const response = once(child, 'message'), closed = once(child, 'close');
    child.send({ documentType: 'national_id', front: { mimeType: 'image/png', bytes }, back: { mimeType: 'image/png', bytes }, timeoutMs: 2000 });
    expect((await response)[0]).toEqual({ ok: false, failureCode: 'configuration', retryable: false });
    await closed;
  } finally { if (child?.exitCode === null) child.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); }
}, 5000);
it('rejects oversized, over-pixel and MIME-mismatched evidence before model initialization', async () => {
  const png = new Uint8Array(await sharp({ create: { width: 30, height: 20, channels: 3, background: '#fff' } }).png().toBuffer());
  const highPixelPng = new Uint8Array(await sharp({ create: { width: 5001, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer());
  for (const front of [{ mimeType: 'image/png', bytes: new Uint8Array(5 * 1024 * 1024 + 1) }, { mimeType: 'image/png', bytes: highPixelPng }, { mimeType: 'image/jpeg', bytes: png }]) {
    expect(await extractKycFieldsInNode({ documentType: 'national_id', front, back: { mimeType: 'image/png', bytes: png } }, 2000))
      .toMatchObject({ ok: false, failureCode: 'evidence_invalid', retryable: false });
  }
}, 5000);
