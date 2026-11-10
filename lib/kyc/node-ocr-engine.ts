import 'server-only';
import { fork } from 'node:child_process';
import { accessSync } from 'node:fs';
import path from 'node:path';
import type { KycOcrInput } from './ocr';
import type { ExtractedKycFields } from './runtime/ocr-fields.cjs';

export type ModelManifest = { engine: string; version: string; coreVersion: string; models: { code: string; version: string; sha256: string }[] };
export type NodeOcrMetrics = { initializationMs: number; recognitionPasses?: number; childRssBytes: number; cpu: { user: number; system: number }; manifest: ModelManifest };
export type NodeOcrFailureStage = 'message_validation' | 'runtime_load' | 'image_decode' | 'model_manifest' | 'worker_initialize' |
  'worker_core_load' | 'worker_wasm_initialize' | 'worker_language_load' | 'worker_api_initialize' | 'worker_set_parameters' | 'worker_error_callback' |
  'recognition_front' | 'recognition_back' | 'passport_recovery' | 'unexpected_child_error' | 'child_bootstrap' | 'child_no_response';
export type NodeKycOcrOutcome = { ok: true; fields: ExtractedKycFields; metrics: NodeOcrMetrics } |
  { ok: false; failureCode: 'configuration' | 'service_unavailable' | 'timeout' | 'invalid_response' | 'evidence_invalid'; retryable: boolean; failureStage?: NodeOcrFailureStage };
let busy = false;
const failureStages = new Set<NodeOcrFailureStage>(['message_validation', 'runtime_load', 'image_decode', 'model_manifest', 'worker_initialize',
  'worker_core_load', 'worker_wasm_initialize', 'worker_language_load', 'worker_api_initialize', 'worker_set_parameters', 'worker_error_callback',
  'recognition_front', 'recognition_back', 'passport_recovery', 'unexpected_child_error', 'child_bootstrap', 'child_no_response']);
function parseChildPhase(value: unknown): NodeOcrFailureStage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).length !== 2 || message.kind !== 'phase' || typeof message.stage !== 'string'
    || !failureStages.has(message.stage as NodeOcrFailureStage)) return undefined;
  return message.stage as NodeOcrFailureStage;
}
const failure = (failureCode: Extract<NodeKycOcrOutcome, { ok: false }>['failureCode'], retryable = false, failureStage?: NodeOcrFailureStage): NodeKycOcrOutcome => ({
  ok: false, failureCode, retryable, ...(failureStage ? { failureStage } : {}),
});
const launchErrorCodes = new Set(['EACCES', 'EAGAIN', 'ENOENT', 'ENOMEM', 'EPERM', 'ERR_IPC_CHANNEL_CLOSED']);

export function parseNodeKycOcrOutcome(value: unknown): NodeKycOcrOutcome {
  try {
  if (!value || typeof value !== 'object' || Buffer.byteLength(JSON.stringify(value)) > 16384) return failure('invalid_response');
  const data = value as Record<string, unknown>;
  if (data.ok === false && ['configuration', 'service_unavailable', 'timeout', 'invalid_response', 'evidence_invalid'].includes(String(data.failureCode)) && typeof data.retryable === 'boolean') {
    if (data.failureStage !== undefined && (typeof data.failureStage !== 'string' || !failureStages.has(data.failureStage as NodeOcrFailureStage))) return failure('invalid_response');
    return failure(data.failureCode as Extract<NodeKycOcrOutcome, { ok: false }>['failureCode'], data.retryable,
      data.failureStage as NodeOcrFailureStage | undefined);
  }
  if (data.ok !== true || !data.fields || typeof data.fields !== 'object') return failure('invalid_response');
  const fields = data.fields as Record<string, unknown>;
  const text = (key: string, max: number) => fields[key] === null || (typeof fields[key] === 'string' && (fields[key] as string).length <= max);
  const metrics = data.metrics as NodeOcrMetrics | undefined;
  if (!text('holderName', 160) || !text('documentNumber', 40) || !(fields.expiryDate === null || typeof fields.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.expiryDate)) || typeof fields.unreadable !== 'boolean' ||
    !(fields.confidence === null || (typeof fields.confidence === 'number' && Number.isFinite(fields.confidence) && fields.confidence >= 0 && fields.confidence <= 1)) ||
    !metrics || !Number.isFinite(metrics.initializationMs) || !Number.isFinite(metrics.childRssBytes) || !metrics.manifest || metrics.manifest.engine !== 'tesseract-js-7.0.0-v1') return failure('invalid_response');
  if (!metrics.cpu || ![metrics.cpu.user, metrics.cpu.system, metrics.initializationMs, metrics.childRssBytes].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0) ||
    metrics.recognitionPasses !== undefined && (!Number.isSafeInteger(metrics.recognitionPasses) || metrics.recognitionPasses < 1 || metrics.recognitionPasses > 8) ||
    metrics.manifest.version !== '7.0.0' || metrics.manifest.coreVersion !== '7.0.0' || !Array.isArray(metrics.manifest.models) || metrics.manifest.models.length !== 3 ||
    metrics.manifest.models.some((model, index) => model.code !== ['eng', 'msa', 'chi_sim'][index] || model.version !== '1.0.0' || !/^[a-f0-9]{64}$/.test(model.sha256))) return failure('invalid_response');
  const safeMetrics: NodeOcrMetrics = { initializationMs: metrics.initializationMs, ...(metrics.recognitionPasses === undefined ? {} : { recognitionPasses: metrics.recognitionPasses }), childRssBytes: metrics.childRssBytes, cpu: { user: metrics.cpu.user, system: metrics.cpu.system },
    manifest: { engine: metrics.manifest.engine, version: metrics.manifest.version, coreVersion: metrics.manifest.coreVersion,
      models: metrics.manifest.models.map(({ code, version, sha256 }) => ({ code, version, sha256 })) } };
  const nullableCountry = (key: string) => fields[key] === null || fields[key] === undefined || typeof fields[key] === 'string' && /^[A-Z]{2}$/.test(fields[key] as string);
  const comparisonFields = ['document_number', 'holder_name', 'birth_date', 'expiry_date', 'nationality', 'issuer_country', 'sex'];
  const fieldList = (value: unknown) => value === undefined || Array.isArray(value) && value.length <= comparisonFields.length
    && value.every((field) => typeof field === 'string' && comparisonFields.includes(field));
  if (!nullableCountry('issuerCountry') || !nullableCountry('nationality')
    || fields.mrzStatus !== undefined && !['valid', 'invalid', 'unreadable', 'unsupported'].includes(String(fields.mrzStatus))
    || fields.visualComparisonStatus !== undefined && !['consistent', 'conflict', 'incomplete'].includes(String(fields.visualComparisonStatus))
    || !fieldList(fields.visualMismatchFields) || !fieldList(fields.visualMissingFields)
    || fields.passportEvidenceVersion !== undefined && fields.passportEvidenceVersion !== 2) return failure('invalid_response');
  let visualFieldStatuses: ExtractedKycFields['visualFieldStatuses'];
  if (fields.visualFieldStatuses !== undefined) {
    if (!fields.visualFieldStatuses || typeof fields.visualFieldStatuses !== 'object' || Array.isArray(fields.visualFieldStatuses)) return failure('invalid_response');
    const statuses = fields.visualFieldStatuses as Record<string, unknown>;
    if (Object.keys(statuses).length !== comparisonFields.length || comparisonFields.some((field) => !['matched', 'missing', 'conflict'].includes(String(statuses[field])))) return failure('invalid_response');
    visualFieldStatuses = Object.fromEntries(comparisonFields.map((field) => [field, statuses[field]])) as ExtractedKycFields['visualFieldStatuses'];
  }
  if (fields.visualComparisonStatus === 'consistent' && (fields.passportEvidenceVersion !== 2 || !visualFieldStatuses ||
    Object.values(visualFieldStatuses).some((value) => value !== 'matched') || (fields.visualMismatchFields as string[] | undefined)?.length ||
    (fields.visualMissingFields as string[] | undefined)?.length)) return failure('invalid_response');
  return { ok: true, fields: { holderName: fields.holderName as string | null, documentNumber: fields.documentNumber as string | null,
    expiryDate: fields.expiryDate as string | null, confidence: fields.confidence as number | null, unreadable: fields.unreadable,
    issuerCountry: fields.issuerCountry as string | null | undefined, nationality: fields.nationality as string | null | undefined,
    mrzStatus: fields.mrzStatus as ExtractedKycFields['mrzStatus'], visualComparisonStatus: fields.visualComparisonStatus as ExtractedKycFields['visualComparisonStatus'],
    visualMismatchFields: fields.visualMismatchFields as string[] | undefined, visualMissingFields: fields.visualMissingFields as string[] | undefined,
    passportEvidenceVersion: fields.passportEvidenceVersion as 2 | undefined, visualFieldStatuses }, metrics: safeMetrics };
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
      let outcome: NodeKycOcrOutcome = failure('service_unavailable', true), received = false, childStartedAck = false, timedOut = false;
      let childPhase: NodeOcrFailureStage | undefined;
      let spawned = false, launchError: string | undefined;
      let sendFailed = false, sendStatus: 'pending' | 'sent' | 'failed' = 'pending';
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
      };
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      child.once('spawn', () => { spawned = true; });
      child.on('message', (message: unknown) => {
        if (message && typeof message === 'object' && !Array.isArray(message)
          && Object.keys(message).length === 1 && (message as { kind?: unknown }).kind === 'started') {
          childStartedAck = true;
          return;
        }
        if (message && typeof message === 'object' && !Array.isArray(message) && (message as { kind?: unknown }).kind === 'phase') {
          childPhase = parseChildPhase(message) ?? childPhase;
          return;
        }
        if (!received) { received = true; outcome = parseNodeKycOcrOutcome(message); }
      });
      child.on('error', (error) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ERR_IPC_CHANNEL_CLOSED') { sendFailed = true; sendStatus = 'failed'; }
        else launchError = code && launchErrorCodes.has(code) ? code : 'other';
        stop();
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer); clearTimeout(killTimer);
        let result = outcome;
        if (timedOut) result = failure('timeout', true);
        else if (launchError && !spawned) result = failure('configuration');
        else if (!received || (code !== 0 && outcome.ok)) result = failure('service_unavailable', true,
          childPhase ?? (childStartedAck ? 'child_no_response' : 'child_bootstrap'));
        if (!result.ok && result.failureCode !== 'evidence_invalid') {
          // Log process status only. Child output and error messages can contain private data.
          console.warn('kyc_node_ocr_failed', { failureCode: result.failureCode,
            ...(result.failureStage ? { failureStage: result.failureStage } : {}), received, spawned, childStartedAck, sendStatus,
            exitCode: code, signal, launchError, sendFailed });
        }
        resolve(result);
      });
      child.send({ documentType: input.documentType, front: input.front, back: input.back, timeoutMs }, (error) => {
        if (error) { sendFailed = true; sendStatus = 'failed'; stop(); }
        else sendStatus = 'sent';
      });
    });
  } catch {
    console.warn('kyc_node_ocr_failed', { failureCode: 'configuration', failureStage: 'runtime_setup' });
    return failure('configuration');
  }
  finally { busy = false; }
}
