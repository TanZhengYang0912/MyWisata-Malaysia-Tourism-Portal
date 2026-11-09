import 'server-only';
import type { createServiceClient } from '@/lib/supabase/service';
import { kycOcrRuntimeConfiguration, type KycOcrResult } from './ocr';

type Service = ReturnType<typeof createServiceClient>;
type Job = {
  id: string; submissionId: string; leaseToken: string; evidenceRevision: string;
  documentType: 'national_id' | 'passport' | 'driving_license';
  expectedDocumentNumberHmac: string | null; expectedHolderName: string | null;
  documents: { side: 'front' | 'back'; path: string; mimeType: string }[];
};
let nodeTaskBusy = false;
const unavailable = (failureCode: NonNullable<KycOcrResult['failureCode']> = 'evidence_invalid', retryable = false, providerModel = 'private-ocr-v1'): KycOcrResult => ({ failureCode, retryable, status: 'unavailable', holderName: null, documentNumberHmac: null,
  documentNumberLast4: null, expiryDate: null, confidence: null, mismatchFields: [], providerModel });

class EvidenceFailure extends Error {
  constructor(public failureCode: NonNullable<KycOcrResult['failureCode']>, public retryable: boolean) {
    super('kyc_evidence_unavailable');
  }
}

/** These are safety bounds, not enabled production budgets. All values need operator configuration. */
export function kycPrescreeningBudget() {
  const integer = (name: string, maximum: number) => {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : null;
  };
  const batch = integer('KYC_PRESCREENING_BATCH_SIZE', 20);
  const running = integer('KYC_PRESCREENING_MAX_RUNNING', 20);
  const lease = integer('KYC_PRESCREENING_LEASE_SECONDS', 3600);
  const attempts = integer('KYC_PRESCREENING_MAX_ATTEMPTS', 10);
  const retry = integer('KYC_PRESCREENING_RETRY_SECONDS', 86400);
  const privateOcr = kycOcrRuntimeConfiguration();
  const node = privateOcr?.engine === 'tesseract-js';
  if (process.env.KYC_PRESCREENING_ENABLED !== 'true' || !process.env.KYC_IC_HMAC_KEY ||
      !batch || !running || !lease || !attempts || !retry || !privateOcr || lease * 1000 <= privateOcr.timeoutMs * 2) return null;
  const drain = process.env.KYC_PRESCREENING_DRAIN_ENABLED === 'true';
  if (node && (batch !== 1 || running !== 1 || drain || lease < 60 || 15000 + privateOcr.timeoutMs * 2 > 55000)) return null;
  const maxBatches = drain ? integer('KYC_PRESCREENING_DRAIN_MAX_BATCHES', 20) : 1;
  const timeMs = drain ? integer('KYC_PRESCREENING_DRAIN_BUDGET_MS', 120000) : null;
  if (!maxBatches || (drain && (!timeMs || timeMs <= privateOcr.timeoutMs * 2))) return null;
  return { batch, running, lease, attempts, retry, maxBatches, timeMs, timeoutMs: privateOcr.timeoutMs, node };
}

export async function processKycPrescreening(service: Service) {
  const budget = kycPrescreeningBudget();
  const summary = { enabled: Boolean(budget), claimed: 0, acknowledged: 0, ocrProcessed: 0, unavailable: 0, notAcknowledged: 0, writeErrors: 0, batches: 0, stopReason: 'disabled', failureCounts: {} as Record<string, number> };
  if (!budget) return summary;
  if (budget.node && nodeTaskBusy) return { ...summary, stopReason: 'busy' };
  if (budget.node) nodeTaskBusy = true;
  try {
    const model = budget.node ? 'tesseract-js-7.0.0-v1' : 'private-ocr-v1';
    const deadline = budget.node ? performance.now() + 55000 : budget.timeMs ? performance.now() + budget.timeMs : null;
    const signal = (maximum: number) => AbortSignal.timeout(Math.max(1, Math.floor(Math.min(maximum, (deadline ?? Infinity) - performance.now()))));
    for (let batchIndex = 0; batchIndex < budget.maxBatches; batchIndex += 1) {
      if (deadline !== null && performance.now() + budget.timeoutMs * 2 >= deadline) { summary.stopReason = 'time_budget'; break; }
      let serviceFailed = false;
      const claim = service.rpc('claim_kyc_prescreening_jobs', {
        p_limit: budget.batch, p_lease_seconds: budget.lease, p_max_attempts: budget.attempts, p_max_running: budget.running,
      });
      // A cancelled HTTP response cannot prove that SQL did not commit.
      const claimed = await (budget.node ? claim.abortSignal(signal(5000)) : claim).then(value => value, () => ({ data: null, error: true }));
      const { data, error } = claimed;
      if (budget.node && (error || !Array.isArray(data))) { summary.writeErrors += 1; summary.stopReason = 'claim_unknown'; break; }
      if (error || !Array.isArray(data)) throw new Error('kyc_job_claim_failed');
      if (!data.length) { summary.stopReason = 'empty'; break; }
      summary.claimed += data.length;
      summary.batches += 1;
      // SQL caps all workers together. No detached promises or request-local queue.
      await Promise.all((data as Job[]).map(async (job) => {
        let result = unavailable('evidence_invalid', false, model);
        try {
          const { data: observation, error: observationError } = await service.rpc('get_kyc_submission_ocr_observation_v2', {
            p_submission_id: job.submissionId, p_artifact_revision: job.evidenceRevision,
          });
          if (observationError) throw new EvidenceFailure('network', true);
          if (!observation || typeof observation !== 'object' || observation.artifactRevision !== job.evidenceRevision
            || typeof observation.sourceRevision !== 'string') {
            result = { status: 'unreadable', holderName: null, documentNumberHmac: null, documentNumberLast4: null,
              expiryDate: null, confidence: null, mismatchFields: ['ocr_source_unavailable'], providerModel: model,
              failureCode: 'evidence_missing', retryable: false };
          } else {
            const mismatchFields: string[] = [];
            if (observation.status !== 'extracted') mismatchFields.push('ocr_source_unavailable');
            if (!job.expectedDocumentNumberHmac || observation.documentNumberHmac !== job.expectedDocumentNumberHmac) mismatchFields.push('document_number');
            const normalizeName = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').replace(/[<,\-]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase() : '';
            if (!job.expectedHolderName || normalizeName(observation.holderName) !== normalizeName(job.expectedHolderName)) mismatchFields.push('holder_name');
            if (job.documentType === 'passport') {
              if (observation.issuerCountry !== 'CN' || observation.nationality !== 'CN') mismatchFields.push('country_unsupported');
              if (observation.mrzStatus !== 'valid') mismatchFields.push('mrz_invalid');
              if (observation.visualComparisonStatus !== 'consistent') mismatchFields.push('visual_comparison_incomplete');
              if (typeof observation.expiryDate !== 'string' || observation.expiryDate <= new Date().toISOString().slice(0, 10)) mismatchFields.push('expired_or_missing');
            }
            const thresholdText = process.env[budget.node ? 'KYC_NODE_OCR_MIN_CONFIDENCE' : 'KYC_PRIVATE_OCR_MIN_CONFIDENCE'];
            const threshold = thresholdText ? Number(thresholdText) : NaN;
            if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1 || typeof observation.confidence !== 'number' || observation.confidence < threshold) {
              mismatchFields.push('confidence_unvalidated');
            }
            result = { status: mismatchFields.length ? 'mismatch' : 'matched', holderName: typeof observation.holderName === 'string' ? observation.holderName : null,
              documentNumberHmac: typeof observation.documentNumberHmac === 'string' ? observation.documentNumberHmac : null,
              documentNumberLast4: typeof observation.documentNumberLast4 === 'string' ? observation.documentNumberLast4 : null,
              expiryDate: typeof observation.expiryDate === 'string' ? observation.expiryDate : null,
              confidence: typeof observation.confidence === 'number' ? observation.confidence : null, mismatchFields,
              providerModel: typeof observation.engine === 'string' ? observation.engine : model,
              issuerCountry: typeof observation.issuerCountry === 'string' ? observation.issuerCountry : null,
              nationality: typeof observation.nationality === 'string' ? observation.nationality : null,
              mrzStatus: observation.mrzStatus, visualComparisonStatus: observation.visualComparisonStatus };
          }
        } catch (error) {
          result = error instanceof EvidenceFailure ? unavailable(error.failureCode, error.retryable, model) : unavailable(budget.node ? 'invalid_response' : 'network', !budget.node, model);
        }
        if (result.status === 'unavailable') {
          const code = result.failureCode ?? 'service_unavailable';
          summary.failureCounts[code] = (summary.failureCounts[code] ?? 0) + 1;
          if (!code.startsWith('evidence_')) serviceFailed = true;
        }
        try {
          const finish = service.rpc('finish_kyc_prescreening_job', {
            p_job_id: job.id, p_token: job.leaseToken, p_result: result, p_retry_seconds: budget.retry,
          });
          const { data: saved, error: finishError } = await (budget.node ? finish.abortSignal(signal(5000)) : finish);
          if (finishError) summary.writeErrors += 1;
          else if (saved === true) {
            summary.acknowledged += 1;
            if (result.status === 'unavailable') summary.unavailable += 1;
            else summary.ocrProcessed += 1;
          }
          else summary.notAcknowledged += 1;
        } catch { summary.writeErrors += 1; }
      }));
      summary.stopReason = summary.writeErrors ? 'write_error' : serviceFailed ? 'service_unavailable' : budget.maxBatches === 1 ? 'single_batch' : 'max_batches';
      if (summary.writeErrors || serviceFailed) break;
    }
    return summary;
  } finally { if (budget.node) nodeTaskBusy = false; }
}
