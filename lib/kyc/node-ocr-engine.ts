import 'server-only';
import { fork } from 'node:child_process';
import { accessSync } from 'node:fs';
import path from 'node:path';
import type { KycOcrInput } from './ocr';
import type { ExtractedKycFields } from './runtime/ocr-fields.cjs';

export type ModelManifest = { engine: string; version: string; coreVersion: string; models: { code: string; version: string; sha256: string }[] };
export type NodeOcrMetrics = { initializationMs: number; childRssBytes: number; cpu: { user: number; system: number }; manifest: ModelManifest };
export type NodeKycOcrOutcome = { ok: true; fields: ExtractedKycFields; metrics: NodeOcrMetrics } |
  { ok: false; failureCode: 'configuration' | 'service_unavailable' | 'timeout' | 'invalid_response' | 'evidence_invalid'; retryable: boolean };
let busy = false;
const failure = (failureCode: Extract<NodeKycOcrOutcome, { ok: false }>['failureCode'], retryable = false): NodeKycOcrOutcome => ({ ok: false, failureCode, retryable });

export function parseNodeKycOcrOutcome(value: unknown): NodeKycOcrOutcome {
  try {
  if (!value || typeof value !== 'object' || Buffer.byteLength(JSON.stringify(value)) > 16384) return failure('invalid_response');
  const data = value as Record<string, unknown>;
  if (data.ok === false && ['configuration', 'service_unavailable', 'timeout', 'invalid_response', 'evidence_invalid'].includes(String(data.failureCode)) && typeof data.retryable === 'boolean') {
    return failure(data.failureCode as Extract<NodeKycOcrOutcome, { ok: false }>['failureCode'], data.retryable);
  }
  if (data.ok !== true || !data.fields || typeof data.fields !== 'object') return failure('invalid_response');
  const fields = data.fields as Record<string, unknown>;
  const text = (key: string, max: number) => fields[key] === null || (typeof fields[key] === 'string' && (fields[key] as string).length <= max);
  const metrics = data.metrics as NodeOcrMetrics | undefined;
  if (!text('holderName', 160) || !text('documentNumber', 40) || !(fields.expiryDate === null || typeof fields.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.expiryDate)) || typeof fields.unreadable !== 'boolean' ||
    !(fields.confidence === null || (typeof fields.confidence === 'number' && Number.isFinite(fields.confidence) && fields.confidence >= 0 && fields.confidence <= 1)) ||
    !metrics || !Number.isFinite(metrics.initializationMs) || !Number.isFinite(metrics.childRssBytes) || !metrics.manifest || metrics.manifest.engine !== 'tesseract-js-7.0.0-v1') return failure('invalid_response');
  if (!metrics.cpu || ![metrics.cpu.user, metrics.cpu.system, metrics.initializationMs, metrics.childRssBytes].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) ||
    metrics.manifest.version !== '7.0.0' || metrics.manifest.coreVersion !== '7.0.0' || !Array.isArray(metrics.manifest.models) || metrics.manifest.models.length !== 3 ||
    metrics.manifest.models.some((model, index) => model.code !== ['eng', 'msa', 'chi_sim'][index] || model.version !== '1.0.0' || !/^[a-f0-9]{64}$/.test(model.sha256))) return failure('invalid_response');
  const safeMetrics: NodeOcrMetrics = { initializationMs: metrics.initializationMs, childRssBytes: metrics.childRssBytes, cpu: { user: metrics.cpu.user, system: metrics.cpu.system },
    manifest: { engine: metrics.manifest.engine, version: metrics.manifest.version, coreVersion: metrics.manifest.coreVersion,
      models: metrics.manifest.models.map(({ code, version, sha256 }) => ({ code, version, sha256 })) } };
  const nullableCountry = (key: string) => fields[key] === null || fields[key] === undefined || typeof fields[key] === 'string' && /^[A-Z]{2}$/.test(fields[key] as string);
  if (!nullableCountry('issuerCountry') || !nullableCountry('nationality')
    || fields.mrzStatus !== undefined && !['valid', 'invalid', 'unreadable', 'unsupported'].includes(String(fields.mrzStatus))
    || fields.visualComparisonStatus !== undefined && !['consistent', 'conflict', 'incomplete'].includes(String(fields.visualComparisonStatus))
    || fields.visualMismatchFields !== undefined && (!Array.isArray(fields.visualMismatchFields) || fields.visualMismatchFields.length > 8
      || fields.visualMismatchFields.some((field) => typeof field !== 'string' || !/^[a-z_]{1,40}$/.test(field)))) return failure('invalid_response');
  return { ok: true, fields: { holderName: fields.holderName as string | null, documentNumber: fields.documentNumber as string | null,
    expiryDate: fields.expiryDate as string | null, confidence: fields.confidence as number | null, unreadable: fields.unreadable,
    issuerCountry: fields.issuerCountry as string | null | undefined, nationality: fields.nationality as string | null | undefined,
    mrzStatus: fields.mrzStatus as ExtractedKycFields['mrzStatus'], visualComparisonStatus: fields.visualComparisonStatus as ExtractedKycFields['visualComparisonStatus'],
    visualMismatchFields: fields.visualMismatchFields as string[] | undefined }, metrics: safeMetrics };
  } catch { return failure('invalid_response'); }
}

export async function extractKycFieldsInNode(input: Pick<KycOcrInput, 'documentType' | 'front' | 'back'>, timeoutMs: number): Promise<NodeKycOcrOutcome> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) return failure('configuration');
  if (busy) return failure('service_unavailable', true);
  busy = true;
  try {
    // Next start's project root is the deployment root; tracing includes this
    // fixed runtime tree. Resolve it as a real CJS file, never a webpack chunk.
    const runtime = path.join(process.cwd(), 'lib/kyc/runtime/tesseract-process.cjs');
    accessSync(runtime);
    return await new Promise<NodeKycOcrOutcome>((resolve) => {
      const child = fork(runtime, [], { execPath: process.execPath, execArgv: [], env: { NODE_ENV: 'production' }, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      let outcome: NodeKycOcrOutcome = failure('service_unavailable', true), received = false, timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
      };
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      child.on('message', (message: unknown) => { if (!received) { received = true; outcome = parseNodeKycOcrOutcome(message); } });
      child.on('error', () => { outcome = failure('configuration'); stop(); });
      child.on('close', (code) => {
        clearTimeout(timer); clearTimeout(killTimer);
        resolve(timedOut ? failure('timeout', true) : received && code === 0 ? outcome : code === null ? failure('service_unavailable', true) : outcome);
      });
      child.send({ documentType: input.documentType, front: input.front, back: input.back, timeoutMs }, (error) => { if (error) stop(); });
    });
  } catch { return failure('configuration'); }
  finally { busy = false; }
}
