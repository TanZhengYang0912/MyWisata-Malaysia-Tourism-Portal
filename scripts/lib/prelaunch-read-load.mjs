/** Bounded, unauthenticated HTTP GET check for the user-authorized prelaunch site. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeMeasurements } from './kyc-capacity-evaluation.mjs';

export const origin = 'https://mylawatan.my';
export const limits = Object.freeze({ requests: 180, concurrent: 12, rps: 4,
  timeoutMs: 8000, totalMs: 180_000, bodyBytes: 4 * 1024 * 1024, stopP95Ms: 6000 });
export const routes = Object.freeze({
  health: '/api/health',
  search: '/api/search?q=Penang',
  campaigns: '/api/customer/promotion-campaigns',
  explore: '/customer/explore',
});
const mix = ['health', 'search', 'campaigns', 'explore', 'search',
  'campaigns', 'search', 'explore', 'search', 'search'];
export const phases = [
  { name: 'baseline', rps: 1, durationMs: 20_000 },
  { name: 'read-2rps', rps: 2, durationMs: 20_000 },
  { name: 'read-4rps', rps: 4, durationMs: 20_000 },
  { name: 'recovery-observation', rps: 1, durationMs: 20_000 },
];

export function validateBody(key, contentType, body) {
  if (key === 'explore') {
    if (!contentType.includes('text/html') || !/<html[\s>]/i.test(body) || !body.includes('Explore Malaysia')
      || body.includes('id="__next_error__"') || /dataUnavailable\\?"\s*:\s*true/.test(body)) {
      throw new Error('explore_content_unavailable');
    }
    return;
  }
  if (!contentType.includes('application/json')) throw new Error('unexpected_content_type');
  const value = JSON.parse(body);
  if (key === 'health') {
    if (value?.status !== 'ok' || value.checks?.database !== 'ok') throw new Error('database_unavailable');
  } else if (key === 'search') {
    if (!Array.isArray(value?.destinations) || !Array.isArray(value.experiences) || !Array.isArray(value.vendors)) {
      throw new Error('search_contract_invalid');
    }
  } else if (key === 'campaigns') {
    if (value?.error || !Array.isArray(value?.data?.campaigns)) throw new Error('campaigns_contract_invalid');
  } else {
    throw new Error('route_not_allowed');
  }
}

async function boundedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('response_body_missing');
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limits.bodyBytes) throw new Error('response_byte_limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { bytes, body: Buffer.concat(chunks, bytes).toString('utf8') };
}

function measurements(values) {
  const result = summarizeMeasurements(values);
  const sorted = [...values].sort((a, b) => a - b);
  return { ...result, p99Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.99) - 1] : null };
}

export function summarizeStage(stage) {
  const byRoute = {};
  for (const key of Object.keys(routes)) {
    const samples = stage.samples.filter(sample => sample.route === key);
    if (!samples.length) continue;
    const ok = samples.filter(sample => sample.kind === 'ok');
    byRoute[key] = {
      started: samples.length, ok: ok.length,
      failed: samples.filter(sample => sample.kind === 'failed').length,
      cancelled: samples.filter(sample => sample.kind === 'cancelled').length,
      latency: measurements(ok.map(sample => sample.elapsedMs)),
      ttfb: measurements(ok.map(sample => sample.ttfbMs)),
      bodyBytes: ok.reduce((sum, sample) => sum + sample.bytes, 0),
      statuses: samples.reduce((counts, sample) => {
        const status = sample.status ?? sample.error;
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
      cdn: samples.reduce((counts, sample) => {
        if (sample.cdn) counts[sample.cdn] = (counts[sample.cdn] ?? 0) + 1;
        return counts;
      }, {}),
    };
  }
  return { name: stage.name, targetRps: stage.rps, planned: stage.planned,
    started: stage.samples.length, skippedAtClientCap: stage.skipped,
    notIssuedAfterStop: stage.planned - stage.samples.length - stage.skipped,
    peakInFlight: stage.peakInFlight, elapsedMs: stage.elapsedMs,
    observedIssueRps: Number((stage.samples.length / (stage.issueWindowMs / 1000)).toFixed(2)),
    stopReason: stage.stopReason, byRoute };
}

/** Open arrival clock; no retries, redirect following, cookies, JS or queued backlog. */
export async function runStage(phase, { fetcher = fetch, budget = { issued: 0 },
  maxConcurrent = limits.concurrent, deadline = Infinity, preflight = false } = {}) {
  assert.ok(phase.rps > 0 && phase.rps <= limits.rps);
  assert.ok(phase.durationMs > 0 && phase.durationMs <= 20_000);
  assert.ok(Number.isInteger(maxConcurrent) && maxConcurrent > 0 && maxConcurrent <= limits.concurrent);
  const stage = { ...phase, planned: preflight ? 4 : Math.ceil(phase.rps * phase.durationMs / 1000),
    samples: [], skipped: 0, peakInFlight: 0, stopReason: null };
  const controller = new AbortController();
  const pending = new Set();
  const start = performance.now();
  const stop = reason => {
    if (!stage.stopReason) { stage.stopReason = reason; controller.abort(); }
  };

  async function request(key) {
    const started = performance.now();
    const sample = { route: key, status: null, cdn: null, kind: 'failed', bytes: 0 };
    try {
      assert.ok(Object.hasOwn(routes, key), 'route_not_allowed');
      const response = await fetcher(new URL(routes[key], origin), {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        headers: { 'user-agent': 'MYLawatan-Authorized-Capacity-Check/1.0', accept: key === 'explore' ? 'text/html' : 'application/json' },
        signal: AbortSignal.any([controller.signal,
          AbortSignal.timeout(Math.ceil(Math.min(limits.timeoutMs, Math.max(1, deadline - performance.now()))))]),
      });
      sample.ttfbMs = performance.now() - started;
      sample.status = response.status;
      sample.cdn = response.headers.get('x-hcdn-cache-status');
      const { bytes, body } = await boundedBody(response);
      sample.bytes = bytes;
      if (response.status !== 200) throw new Error(`http_${response.status}`);
      validateBody(key, response.headers.get('content-type') ?? '', body);
      sample.kind = 'ok';
    } catch (error) {
      sample.kind = controller.signal.aborted ? 'cancelled' : 'failed';
      sample.error = error.name === 'TimeoutError' ? 'timeout' : error.message;
      if (sample.kind === 'failed') stop(`${key}:${sample.error}`);
    } finally {
      sample.elapsedMs = performance.now() - started;
      stage.samples.push(sample);
      const latency = stage.samples.filter(item => item.route === key && item.kind === 'ok').map(item => item.elapsedMs);
      if (latency.length >= 5 && summarizeMeasurements(latency).p95Ms > limits.stopP95Ms) stop(`${key}:p95_above_6000ms`);
    }
  }

  for (let index = 0; index < stage.planned; index += 1) {
    const scheduled = start + index * 1000 / phase.rps;
    await sleep(Math.max(0, scheduled - performance.now()));
    if (stage.stopReason) break;
    if (performance.now() >= deadline || budget.issued >= limits.requests) { stop('global_budget'); break; }
    if (pending.size >= maxConcurrent) { stage.skipped += 1; continue; }
    budget.issued += 1;
    const key = preflight ? Object.keys(routes)[index] : mix[index % mix.length];
    const work = request(key);
    pending.add(work);
    stage.peakInFlight = Math.max(stage.peakInFlight, pending.size);
    void work.finally(() => pending.delete(work));
  }
  if (!stage.stopReason) await sleep(Math.max(0, start + (preflight ? 4000 : phase.durationMs) - performance.now()));
  stage.issueWindowMs = Math.max(1, performance.now() - start);
  await Promise.all(pending);
  stage.elapsedMs = Math.round(performance.now() - start);
  return summarizeStage(stage);
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.log(JSON.stringify({ mode: 'dry-run; pass --run for user-authorized prelaunch GETs', origin, routes, limits, phases }));
    return;
  }
  const startedAt = new Date().toISOString();
  const deadline = performance.now() + limits.totalMs;
  const budget = { issued: 0 };
  const stages = [];
  for (const phase of [{ name: 'preflight', rps: 1, durationMs: 4000 }, ...phases]) {
    const stage = await runStage(phase, { budget, deadline, preflight: phase.name === 'preflight' });
    stages.push(stage);
    console.log(JSON.stringify({ type: 'stage', ...stage }));
    if (stage.stopReason) break;
  }
  console.log(JSON.stringify({ type: 'result', startedAt, finishedAt: new Date().toISOString(), origin,
    issued: budget.issued, limits, stages,
    scope: 'Raw HTTP GET only; no assets/JS/impressions, logins, writes, OTP, payments or OCR. Client-network latency; not a user-count or host-resource certification.' }));
  if (stages.some(stage => stage.stopReason || stage.skippedAtClientCap)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
