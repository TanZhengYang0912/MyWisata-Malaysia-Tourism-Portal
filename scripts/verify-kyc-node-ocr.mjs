#!/usr/bin/env node
/** Explicit, synthetic-only deployment probe. No document input or remote DB access. */
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
const failureCodes = new Set(['configuration', 'service_unavailable', 'timeout', 'invalid_response', 'evidence_invalid']);
const failureStages = new Set(['message_validation', 'runtime_load', 'image_decode', 'model_manifest', 'worker_initialize',
  'worker_core_load', 'worker_wasm_initialize', 'worker_language_load', 'worker_api_initialize', 'worker_set_parameters', 'worker_error_callback',
  'recognition_front', 'recognition_back', 'passport_recovery', 'unexpected_child_error', 'child_bootstrap', 'child_no_response']);
export async function verifySyntheticOcr(options, request = fetch) {
  const origin = new URL(options.origin);
  const local = origin.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(origin.hostname);
  if (!options.runSynthetic || !options.secret || (!local && origin.origin !== 'https://mylawatan.my') || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('probe_options_invalid');
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    const response = await request(new URL('/api/cron/process-kyc-prescreening', origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { authorization: `Bearer ${options.secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'synthetic-check' }) });
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 16384) throw new Error('probe_failed');
    const result = JSON.parse(raw);
    if (!response.ok) {
      if (response.status === 503 && result?.ok === false && failureCodes.has(result.failureCode)
        && (result.failureStage === undefined || failureStages.has(result.failureStage))) {
        return { ok: false, failureCode: result.failureCode, ...(result.failureStage ? { failureStage: result.failureStage } : {}) };
      }
      throw new Error('probe_failed');
    }
    if (result.ok !== true || result.fieldsRead !== true || !isDeepStrictEqual(result.manifest, options.manifest)) throw new Error('probe_failed');
    const sample = {};
    for (const name of ['initializationMs', 'totalMs', 'parentRssBytes', 'childRssBytes', 'cpuMicroseconds']) {
      if (typeof result[name] !== 'number' || !Number.isFinite(result[name]) || result[name] < 0) throw new Error('probe_failed');
      sample[name] = result[name];
    }
    samples.push(sample);
  }
  return { ok: true, samples };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 5 || args[0] !== '--origin' || args[2] !== '--manifest' || args[4] !== '--run-synthetic') throw new Error('probe_options_invalid');
    const manifest = JSON.parse(await readFile(args[3], 'utf8'));
    const result = await verifySyntheticOcr({ origin: args[1], manifest, runSynthetic: true, secret: process.env.CRON_SECRET });
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch { console.error('kyc_synthetic_verification_failed'); process.exitCode = 1; }
}
