import 'server-only';
import { isIP } from 'node:net';
import { extractKycFieldsInNode } from './node-ocr-engine';

import { hashICWithHmac, normalizeIC } from './hash';
export { requiresManualKycReview } from './ocr-policy';

export type KycOcrStatus = 'matched' | 'mismatch' | 'unreadable' | 'unavailable';

export type KycOcrInput = {
  documentType: 'national_id' | 'passport' | 'driving_license';
  enteredDocumentNumber?: string;
  expectedDocumentNumberHmac?: string;
  expectedHolderName?: string | null;
  front: { mimeType: string; bytes: Uint8Array };
  back: { mimeType: string; bytes: Uint8Array };
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
};

export type KycOcrPreviewResult = {
  status: 'extracted' | 'unreadable' | 'unavailable';
  holderName: string | null;
  documentNumber: string | null;
  expiryDate: string | null;
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

async function readPrivateResult(response: Response): Promise<ExtractedOcr | null> {
  if (!response.body || Number(response.headers.get('content-length')) > 16384) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data as ExtractedOcr : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
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
  if (!configuration) return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'configuration' };
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
        body: JSON.stringify({ documentType: input.documentType, front: imagePart(input.front), back: imagePart(input.back) }),
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel,
          failureCode: retryable ? 'service_unavailable' : [401, 403].includes(response.status) ? 'service_auth' : 'service_rejected', retryable };
      }
      fields = await readPrivateResult(response);
      if (!fields || (typeof fields.unreadable !== 'boolean' && typeof fields.documentNumber !== 'string')) {
        return { status: 'unavailable', holderName: null, documentNumber: null, expiryDate: null, confidence: null, providerModel, failureCode: 'invalid_response' };
      }
    }
    const holderName = nullableText(fields.holderName);
    const documentNumber = nullableText(fields.documentNumber, 40);
    const confidence = nullableConfidence(fields.confidence);
    return { status: fields.unreadable === true || !documentNumber ? 'unreadable' : 'extracted', holderName, documentNumber,
      expiryDate: nullableDate(fields.expiryDate), confidence, providerModel };
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
    return { status: 'unreadable', holderName, documentNumberHmac: null, documentNumberLast4: null, expiryDate: nullableDate(extracted.expiryDate), confidence, mismatchFields: [], providerModel };
  }

  const extractedHmac = await hashICWithHmac(documentNumber, input.hmacKey);
  const expectedHmac = input.expectedDocumentNumberHmac
    ?? (input.enteredDocumentNumber ? (await hashICWithHmac(input.enteredDocumentNumber, input.hmacKey)).value : null);
  if (!expectedHmac || !/^[a-f0-9]{64}$/.test(expectedHmac)) return unavailable(providerModel);
  const mismatchFields = extractedHmac.value === expectedHmac ? [] : ['document_number'];
  const name = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toUpperCase();
  if (input.expectedHolderName && (!holderName || name(holderName) !== name(input.expectedHolderName))) mismatchFields.push('holder_name');
  const compact = normalizeIC(documentNumber);
  return {
    status: mismatchFields.length === 0 ? 'matched' : 'mismatch',
    holderName,
    documentNumberHmac: extractedHmac.value,
    documentNumberLast4: compact.slice(-4) || null,
    expiryDate: nullableDate(extracted.expiryDate),
    confidence,
    mismatchFields,
    providerModel,
  };
}

export async function runKycOcr(input: KycOcrInput): Promise<KycOcrResult> {
  const configuration = kycOcrRuntimeConfiguration();
  const providerModel = configuration?.engine === 'tesseract-js' ? 'tesseract-js-7.0.0-v1' : DEFAULT_MODEL;
  if (!configuration) return unavailable(providerModel);
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
      body: JSON.stringify({ documentType: input.documentType, front: imagePart(input.front), back: imagePart(input.back) }),
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      return unavailable(providerModel, retryable ? 'service_unavailable' : [401, 403].includes(response.status) ? 'service_auth' : 'service_rejected', retryable);
    }
    const extracted = await readPrivateResult(response);
    if (!extracted || (typeof extracted.unreadable !== 'boolean' && typeof extracted.documentNumber !== 'string')) return unavailable(providerModel, 'invalid_response');
    return await compareExtractedKycFields(extracted, input, providerModel);
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return unavailable(providerModel, timeout ? 'timeout' : configuration.engine === 'tesseract-js' ? 'invalid_response' : 'network', configuration.engine !== 'tesseract-js' || timeout);
  }
}
