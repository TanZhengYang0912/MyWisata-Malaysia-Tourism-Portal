import 'server-only';

import { hashICWithHmac, normalizeIC } from './hash';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requiresManualKycReview } from './ocr-policy';
export { requiresManualKycReview } from './ocr-policy';

export type KycOcrStatus = 'matched' | 'mismatch' | 'unreadable' | 'unavailable';

export type KycOcrInput = {
  documentType: 'national_id' | 'passport' | 'driving_license';
  enteredDocumentNumber: string;
  front: { mimeType: string; bytes: Uint8Array };
  back: { mimeType: string; bytes: Uint8Array };
  hmacKey: string;
};

export type KycOcrResult = {
  status: KycOcrStatus;
  holderName: string | null;
  documentNumberHmac: string | null;
  documentNumberLast4: string | null;
  expiryDate: string | null;
  confidence: number | null;
  mismatchFields: string[];
  providerModel: string;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

type ExtractedOcr = {
  holderName?: unknown;
  documentNumber?: unknown;
  expiryDate?: unknown;
  confidence?: unknown;
  unreadable?: unknown;
};

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function unavailable(providerModel: string): KycOcrResult {
  return {
    status: 'unavailable', holderName: null, documentNumberHmac: null, documentNumberLast4: null,
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

function extractJson(text: string): ExtractedOcr | null {
  const withoutFence = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(withoutFence);
    return parsed && typeof parsed === 'object' ? parsed as ExtractedOcr : null;
  } catch {
    return null;
  }
}

function imagePart(image: { mimeType: string; bytes: Uint8Array }) {
  return { inlineData: { mimeType: image.mimeType, data: Buffer.from(image.bytes).toString('base64') } };
}

export async function runKycOcr(input: KycOcrInput): Promise<KycOcrResult> {
  const providerModel = process.env.GEMINI_OCR_MODEL ?? DEFAULT_MODEL;
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return unavailable(providerModel);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerModel}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [
          { text: `Read these FRONT and BACK images of a ${input.documentType}. Return JSON only: {"holderName":string|null,"documentNumber":string|null,"expiryDate":"YYYY-MM-DD"|null,"confidence":number,"unreadable":boolean}. This is OCR assistance only, never an approval decision. Use unreadable=true when a required field cannot be read reliably.` },
          imagePart(input.front), imagePart(input.back),
        ] }],
      }),
    });
    if (!response.ok) return unavailable(providerModel);

    const body = await response.json() as GeminiResponse;
    const extracted = extractJson(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    if (!extracted) return unavailable(providerModel);

    const holderName = nullableText(extracted.holderName);
    const documentNumber = nullableText(extracted.documentNumber, 40);
    const confidence = nullableConfidence(extracted.confidence);
    if (extracted.unreadable === true || !documentNumber) {
      return { status: 'unreadable', holderName, documentNumberHmac: null, documentNumberLast4: null, expiryDate: nullableDate(extracted.expiryDate), confidence, mismatchFields: [], providerModel };
    }

    const extractedHmac = await hashICWithHmac(documentNumber, input.hmacKey);
    const enteredHmac = await hashICWithHmac(input.enteredDocumentNumber, input.hmacKey);
    const isMatch = extractedHmac.value === enteredHmac.value;
    const compact = normalizeIC(documentNumber);
    return {
      status: isMatch ? 'matched' : 'mismatch',
      holderName,
      documentNumberHmac: extractedHmac.value,
      documentNumberLast4: compact.slice(-4) || null,
      expiryDate: nullableDate(extracted.expiryDate),
      confidence,
      mismatchFields: isMatch ? [] : ['document_number'],
      providerModel,
    };
  } catch {
    return unavailable(providerModel);
  }
}
