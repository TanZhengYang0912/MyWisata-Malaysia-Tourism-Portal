import 'server-only';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { extractKycFieldsInNode } from './node-ocr-engine';

import { hashICWithHmac, normalizeIC } from './hash';
import { hasRequiredKycEvidence } from './document-policy';
import { extractKycFields, validatePassportLayout, normalizePassportName, parseTd3Mrz } from './runtime/ocr-fields.cjs';
export { requiresManualKycReview } from './ocr-policy';

export type KycOcrStatus = 'matched' | 'mismatch' | 'unreadable' | 'unavailable';

export type ManualPassportFields = {
  mrzLine1: string;
  mrzLine2: string;
  holderName: string;
  documentNumber: string;
  issuerCountry: string;
  nationality: string;
  birthDate: string;
  expiryDate: string;
  sex: string;
};

/** Transcription is transient. The caller binds these facts to a current, independently viewed evidence snapshot. */
export function verifyManualPassportFields(fields: ManualPassportFields, today = new Date().toISOString().slice(0, 10)):
  | { valid: false }
  | { valid: true; method: 'manual_td3_v1'; nationality: 'CN'; expiryDate: string; mrzStatus: 'valid'; visualComparisonStatus: 'consistent' } {
  const invalid = { valid: false } as const;
  if (![fields.mrzLine1, fields.mrzLine2].every((line) => /^[A-Z0-9<]{44}$/.test(line))) return invalid;
  const mrz = parseTd3Mrz([{ text: fields.mrzLine1, confidence: null }, { text: fields.mrzLine2, confidence: null }]);
  if (mrz.status !== 'valid' || mrz.issuerCode !== 'CHN' || mrz.nationalityCode !== 'CHN'
    || !mrz.documentNumber || !mrz.birthDate || !mrz.expiryDate
    || !(/^[GE]\d{8}$/.test(mrz.documentNumber) || /^E[A-HJ-NP-Z]\d{7}$/.test(mrz.documentNumber))) return invalid;
  // The visible four-digit year resolves the MRZ's two-digit year without guessing a century.
  const expiryDate = fields.expiryDate;
  const birthDate = fields.birthDate;
  const isCalendarDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isCalendarDate(birthDate) || birthDate > today
    || birthDate.slice(2).replace(/-/g, '') !== mrz.birthDate
    || !isCalendarDate(expiryDate) || expiryDate.slice(2).replace(/-/g, '') !== mrz.expiryDate || expiryDate <= today
    || fields.issuerCountry.toUpperCase() !== 'CN' || fields.nationality.toUpperCase() !== 'CN'
    || !['M', 'F', '<'].includes(fields.sex) || fields.sex !== mrz.sex
    || normalizeIC(fields.documentNumber) !== mrz.documentNumber
    || normalizePassportName(fields.holderName) !== normalizePassportName([mrz.surname, mrz.givenNames].filter(Boolean).join(' '))) return invalid;
  return { valid: true, method: 'manual_td3_v1', nationality: 'CN', expiryDate, mrzStatus: 'valid', visualComparisonStatus: 'consistent' };
}

export type KycOcrInput = {
  documentType: 'national_id' | 'passport' | 'driving_license';
  enteredDocumentNumber?: string;
  expectedDocumentNumberHmac?: string;
  expectedHolderName?: string | null;
  front: { mimeType: string; bytes: Uint8Array };
  back?: { mimeType: string; bytes: Uint8Array };
  hmacKey: string;
};

export type KycOcrFailureCode = 'configuration' | 'service_auth' | 'service_rejected' | 'service_unavailable' | 'network' | 'timeout' | 'invalid_response' | 'evidence_missing' | 'evidence_invalid';

export type KycOcrResult = {
  failureCode?: KycOcrFailureCode;
  retryable?: boolean;
  status: KycOcrStatus;
  holderName: string | null;
  documentNumberHmac: string | null;
  documentNumberLast4: string | null;
  expiryDate: string | null;
  confidence: number | null;
  mismatchFields: string[];
  providerModel: string;
  issuerCountry?: string | null;
  nationality?: string | null;
  mrzStatus?: 'valid' | 'invalid' | 'unreadable' | 'unsupported';
  visualComparisonStatus?: 'consistent' | 'conflict' | 'incomplete';
  visualMismatchFields?: string[];
  visualMissingFields?: string[];
};

export type KycOcrPreviewResult = {
  status: 'extracted' | 'unreadable' | 'unavailable';
  holderName: string | null;
  documentNumber: string | null;
  expiryDate: string | null;
  issuerCountry?: string | null;
  nationality?: string | null;
  mrzStatus?: 'valid' | 'invalid' | 'unreadable' | 'unsupported';
  visualComparisonStatus?: 'consistent' | 'conflict' | 'incomplete';
  /** Reduced, image-bound evidence for fields the customer may compare in the preview. */
  passportFieldEvidence?: { holderName?: 'matched' | 'missing' | 'conflict'; documentNumber?: 'matched' | 'missing' | 'conflict' };
  visualMissingFields?: string[];
  confidence: number | null;
  providerModel: string;
  failureCode?: KycOcrFailureCode;
  retryable?: boolean;
};

type ExtractedOcr = {
  holderName?: unknown;
  documentNumber?: unknown;
  expiryDate?: unknown;
  confidence?: unknown;
  unreadable?: unknown;
  issuerCountry?: unknown;
  nationality?: unknown;
  mrzStatus?: unknown;
  visualComparisonStatus?: unknown;
  visualMismatchFields?: unknown;
  visualMissingFields?: unknown;
  visualFieldStatuses?: unknown;
  passportEvidenceVersion?: unknown;
  passportLayout?: unknown;
  evidenceSha256?: unknown;
};

const DEFAULT_MODEL = 'private-ocr-v1';

function unavailable(providerModel: string, failureCode: KycOcrFailureCode = 'configuration', retryable = false): KycOcrResult {
  return {
    status: 'unavailable', failureCode, retryable, holderName: null, documentNumberHmac: null, documentNumberLast4: null,
    expiryDate: null, confidence: null, mismatchFields: [], providerModel,
  };
}

function nullableText(value: unknown, max = 160): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

function nullableDate(value: unknown): string | null {
  const candidate = nullableText(value, 10);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function nullableConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function imagePart(image: { mimeType: string; bytes: Uint8Array }) {
  return { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString('base64') };
}

/** Literal private addresses avoid public DNS and redirect-based evidence exfiltration. */
export function privateKycOcrConfiguration() {
  try {
    const endpoint = new URL(process.env.KYC_PRIVATE_OCR_URL ?? '');
    const host = endpoint.hostname.replace(/^\[|\]$/g, '');
    const octets = host.split('.').map(Number);
    const loopback = (isIP(host) === 4 && octets[0] === 127) || host === '::1';
    const privateAddress = isIP(host) === 4 && (octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168));
    const privateV6 = isIP(host) === 6 && /^(fc|fd)/i.test(host);
    const token = process.env.KYC_PRIVATE_OCR_TOKEN ?? '';
    const timeoutMs = Number(process.env.KYC_PRIVATE_OCR_TIMEOUT_MS);
    if ((!loopback && !privateAddress && !privateV6) || endpoint.username || endpoint.password
      || endpoint.hash || endpoint.search || (!loopback && endpoint.protocol !== 'https:')
      || !['http:', 'https:'].includes(endpoint.protocol) || token.length < 16
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) return null;
    return { url: endpoint.href, token, timeoutMs };
  } catch { return null; }
}

async function readPrivateResult(response: Response, passport = false): Promise<ExtractedOcr | null> {
  const maximumBytes = passport ? 65536 : 16384;
  if (!response.body || Number(response.headers.get('content-length')) > maximumBytes) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data as ExtractedOcr : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

/** Recompute passport facts from spatially separated observations; a provider's status flag is not evidence. */
function privateFields(fields: ExtractedOcr | null, input: Pick<KycOcrInput, 'documentType' | 'front'>): ExtractedOcr | null {
  if (!fields || input.documentType !== 'passport') return fields;
  try {
    // This binds the trusted private worker response to this image, not to a claimed user/identity.
    const expectedDigest = createHash('sha256').update(input.front.bytes).digest('hex');
    if (fields.evidenceSha256 !== expectedDigest) return null;
    const frontLayout = validatePassportLayout(fields.passportLayout);
    return extractKycFields({ front: [], back: [], frontLayout }, 'passport');
  } catch { return null; }
}

export type KycOcrRuntimeConfiguration =
  | { engine: 'private-http'; timeoutMs: number; url: string; token: string }
  | { engine: 'tesseract-js'; timeoutMs: number };

export function kycOcrRuntimeConfiguration(): KycOcrRuntimeConfiguration | null {
  const engine = process.env.KYC_OCR_ENGINE;
  if (engine === 'tesseract-js') {
    const timeoutMs = Number(process.env.KYC_NODE_OCR_TIMEOUT_MS);
    return Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 20000 ? { engine, timeoutMs } : null;
  }
  if (engine && engine !== 'private-http') return null;
  const configuration = privateKycOcrConfiguration();
  return configuration ? { engine: 'private-http', ...configuration } : null;
}

/** Return only the temporary preview fields to the authenticated owner. Callers must not persist documentNumber. */
export async function extractKycPreviewFields(input: Pick<KycOcrInput, 'documentType' | 'front' | 'back'>): Promise<KycOcrPreviewResult> {
  const configuration = kycOcrRuntimeConfiguration();
  const providerModel = configuration?.engine === 'tesseract-js' ? 'tesseract-js-7.0.0-v1' : DEFAULT_MODEL;
  if (input.documentType === 'passport' && process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED !== 'true') return {
    status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'configuration',
  };
  if (!configuration) return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'configuration' };
  if (!hasRequiredKycEvidence(input.documentType, input.front, input.back)) return {
    status: 'unreadable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'evidence_invalid',
  };
  try {
    let fields: ExtractedOcr | null;
    if (configuration.engine === 'tesseract-js') {
      const result = await extractKycFieldsInNode(input, configuration.timeoutMs);
      if (!result.ok) return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: result.failureCode, retryable: result.retryable };
      fields = result.fields;
    } else {
      const response = await fetch(configuration.url, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${configuration.token}` },
        signal: AbortSignal.timeout(configuration.timeoutMs),
        body: JSON.stringify({ documentType: input.documentType, front: imagePart(input.front), ...(input.back ? { back: imagePart(input.back) } : {}) }),
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel,
          failureCode: retryable ? 'service_unavailable' : [401, 403].includes(response.status) ? 'service_auth' : 'service_rejected', retryable };
      }
      fields = privateFields(await readPrivateResult(response, input.documentType === 'passport'), input);
      if (!fields || (typeof fields.unreadable !== 'boolean' && typeof fields.documentNumber !== 'string')) {
        return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'invalid_response' };
      }
    }
    const holderName = nullableText(fields.holderName);
    const documentNumber = nullableText(fields.documentNumber, 40);
    const confidence = nullableConfidence(fields.confidence);
    const mrzStatus = ['valid', 'invalid', 'unreadable', 'unsupported'].includes(String(fields.mrzStatus))
      ? fields.mrzStatus as KycOcrPreviewResult['mrzStatus'] : undefined;
    const visualComparisonStatus = ['consistent', 'conflict', 'incomplete'].includes(String(fields.visualComparisonStatus))
      ? fields.visualComparisonStatus as KycOcrPreviewResult['visualComparisonStatus'] : undefined;
    const visualFieldStatuses = fields.visualFieldStatuses && typeof fields.visualFieldStatuses === 'object' && !Array.isArray(fields.visualFieldStatuses)
      ? fields.visualFieldStatuses as Record<string, unknown> : null;
    const passportFieldEvidence = input.documentType === 'passport' && visualFieldStatuses
      ? {
        ...( ['matched', 'missing', 'conflict'].includes(String(visualFieldStatuses.holder_name))
          ? { holderName: visualFieldStatuses.holder_name as 'matched' | 'missing' | 'conflict' } : {}),
        ...( ['matched', 'missing', 'conflict'].includes(String(visualFieldStatuses.document_number))
          ? { documentNumber: visualFieldStatuses.document_number as 'matched' | 'missing' | 'conflict' } : {}),
      }
      : undefined;
    return { status: fields.unreadable === true || !documentNumber ? 'unreadable' : 'extracted', holderName, documentNumber,
      expiryDate: nullableDate(fields.expiryDate), issuerCountry: nullableText(fields.issuerCountry, 2)?.toUpperCase() ?? null,
      nationality: nullableText(fields.nationality, 2)?.toUpperCase() ?? null, mrzStatus, visualComparisonStatus, passportFieldEvidence,
      visualMissingFields: Array.isArray(fields.visualMissingFields) ? fields.visualMissingFields.filter((field): field is string => typeof field === 'string' && /^[a-z_]{1,40}$/.test(field)).slice(0, 8) : undefined,
      confidence, providerModel };
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel,
      failureCode: timeout ? 'timeout' : configuration.engine === 'tesseract-js' ? 'invalid_response' : 'network', retryable: timeout || configuration.engine !== 'tesseract-js' };
  }
}

async function compareExtractedKycFields(extracted: ExtractedOcr, input: KycOcrInput, providerModel: string): Promise<KycOcrResult> {
  const holderName = nullableText(extracted.holderName);
  const documentNumber = nullableText(extracted.documentNumber, 40);
  const confidence = nullableConfidence(extracted.confidence);
  if (extracted.unreadable === true || !documentNumber) {
    const mrzStatus = input.documentType === 'passport' && ['valid', 'invalid', 'unreadable', 'unsupported'].includes(String(extracted.mrzStatus))
      ? extracted.mrzStatus as KycOcrResult['mrzStatus'] : undefined;
    const mismatchFields = input.documentType === 'passport' ? [mrzStatus === 'unsupported' ? 'country_unsupported' : mrzStatus === 'invalid' ? 'mrz_invalid' : 'mrz_unreadable'] : [];
    return { status: 'unreadable', holderName, documentNumberHmac: null, documentNumberLast4: null, expiryDate: nullableDate(extracted.expiryDate), confidence, mismatchFields, providerModel,
      ...(input.documentType === 'passport' ? { mrzStatus, visualComparisonStatus: 'incomplete' as const } : {}) };
  }

  const extractedHmac = await hashICWithHmac(documentNumber, input.hmacKey);
  const expectedHmac = input.expectedDocumentNumberHmac
    ?? (input.enteredDocumentNumber ? (await hashICWithHmac(input.enteredDocumentNumber, input.hmacKey)).value : null);
  if (!expectedHmac || !/^[a-f0-9]{64}$/.test(expectedHmac)) return unavailable(providerModel);
  const mismatchFields = extractedHmac.value === expectedHmac ? [] : ['document_number'];
  const issuerCountry = nullableText(extracted.issuerCountry, 2);
  const nationality = nullableText(extracted.nationality, 2);
  const mrzStatus = ['valid', 'invalid', 'unreadable', 'unsupported'].includes(String(extracted.mrzStatus))
    ? extracted.mrzStatus as KycOcrResult['mrzStatus'] : undefined;
  const visualComparisonStatus = ['consistent', 'conflict', 'incomplete'].includes(String(extracted.visualComparisonStatus))
    ? extracted.visualComparisonStatus as KycOcrResult['visualComparisonStatus'] : undefined;
  const visualMismatchFields = Array.isArray(extracted.visualMismatchFields)
    ? extracted.visualMismatchFields.filter((field): field is string => typeof field === 'string' && /^[a-z_]{1,40}$/.test(field)).slice(0, 8) : [];
  const visualMissingFields = Array.isArray(extracted.visualMissingFields)
    ? extracted.visualMissingFields.filter((field): field is string => typeof field === 'string' && /^[a-z_]{1,40}$/.test(field)).slice(0, 8) : [];
  if (input.documentType === 'passport') {
    if (mrzStatus !== 'valid') mismatchFields.push('mrz_invalid');
    if (issuerCountry !== 'CN' || nationality !== 'CN') mismatchFields.push('country_unsupported');
    if (visualComparisonStatus !== 'consistent') mismatchFields.push(visualComparisonStatus === 'conflict' ? 'visual_comparison_conflict' : 'visual_comparison_incomplete');
    if (extracted.passportEvidenceVersion !== 2) mismatchFields.push('source_unverified');
    mismatchFields.push(...visualMismatchFields);
    mismatchFields.push(...visualMissingFields.map((field) => `missing_${field}`));
  }
  const name = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
  const normalizeName = input.documentType === 'passport' ? normalizePassportName : name;
  if (input.expectedHolderName && (!holderName || normalizeName(holderName) !== normalizeName(input.expectedHolderName))) mismatchFields.push('holder_name');
  const compact = normalizeIC(documentNumber);
  const expiryDate = nullableDate(extracted.expiryDate);
  if (input.documentType === 'passport' && expiryDate && expiryDate < new Date().toISOString().slice(0, 10)) mismatchFields.push('expired_document');
  if (input.documentType === 'passport' && !expiryDate) mismatchFields.push('missing_expiry_date');
  return {
    status: mismatchFields.length === 0 ? 'matched' : 'mismatch',
    holderName,
    documentNumberHmac: extractedHmac.value,
    documentNumberLast4: compact.slice(-4) || null,
    expiryDate,
    confidence,
    mismatchFields,
    providerModel,
    issuerCountry,
    nationality,
    mrzStatus,
    visualComparisonStatus,
    visualMismatchFields,
    visualMissingFields,
  };
}

export async function runKycOcr(input: KycOcrInput): Promise<KycOcrResult> {
  const configuration = kycOcrRuntimeConfiguration();
  const providerModel = configuration?.engine === 'tesseract-js' ? 'tesseract-js-7.0.0-v1' : DEFAULT_MODEL;
  if (input.documentType === 'passport' && process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED !== 'true') return unavailable(providerModel);
  if (!configuration) return unavailable(providerModel);
  if (!hasRequiredKycEvidence(input.documentType, input.front, input.back)) return unavailable(providerModel, 'evidence_invalid');
  try {
    if (configuration.engine === 'tesseract-js') {
      // Pass only the image/type boundary, never expected answers or app secrets.
      const local = await extractKycFieldsInNode({ documentType: input.documentType, front: input.front, back: input.back }, configuration.timeoutMs);
      return local.ok ? compareExtractedKycFields(local.fields, input, providerModel) : unavailable(providerModel, local.failureCode, local.retryable);
    }
    const response = await fetch(configuration.url, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${configuration.token}` },
      signal: AbortSignal.timeout(configuration.timeoutMs),
      body: JSON.stringify({ documentType: input.documentType, front: imagePart(input.front), ...(input.back ? { back: imagePart(input.back) } : {}) }),
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      return unavailable(providerModel, retryable ? 'service_unavailable' : [401, 403].includes(response.status) ? 'service_auth' : 'service_rejected', retryable);
    }
    const extracted = privateFields(await readPrivateResult(response, input.documentType === 'passport'), input);
    if (!extracted || (typeof extracted.unreadable !== 'boolean' && typeof extracted.documentNumber !== 'string')) return unavailable(providerModel, 'invalid_response');
    return await compareExtractedKycFields(extracted, input, providerModel);
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return unavailable(providerModel, timeout ? 'timeout' : configuration.engine === 'tesseract-js' ? 'invalid_response' : 'network', configuration.engine !== 'tesseract-js' || timeout);
  }
}
