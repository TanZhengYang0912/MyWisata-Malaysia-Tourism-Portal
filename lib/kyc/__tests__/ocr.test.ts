import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractKycPreviewFields, runKycOcr } from '../ocr';

function configure() {
  vi.stubEnv('KYC_PRIVATE_OCR_URL', 'http://127.0.0.1:8091/ocr');
  vi.stubEnv('KYC_PRIVATE_OCR_TOKEN', 'private-test-token');
  vi.stubEnv('KYC_PRIVATE_OCR_TIMEOUT_MS', '20000');
}
const originalKey = process.env.GOOGLE_AI_KEY;
const originalConsent = process.env.KYC_EXTERNAL_OCR_ENABLED;
const originalModel = process.env.GEMINI_OCR_MODEL;

const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function input(overrides: Partial<Parameters<typeof runKycOcr>[0]> = {}) {
  return {
    documentType: 'national_id' as const,
    enteredDocumentNumber: '900101-14-1234',
    front: { mimeType: 'image/jpeg', bytes: imageBytes },
    back: { mimeType: 'image/jpeg', bytes: imageBytes },
    hmacKey: 'test-hmac-key',
    ...overrides,
  };
}

function privateResponse(text: string, ok = true, status = 200) {
  return new Response(ok ? text : '{}', { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (originalConsent === undefined) delete process.env.KYC_EXTERNAL_OCR_ENABLED;
  else process.env.KYC_EXTERNAL_OCR_ENABLED = originalConsent;
  if (originalKey === undefined) delete process.env.GOOGLE_AI_KEY;
  else process.env.GOOGLE_AI_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_OCR_MODEL;
  else process.env.GEMINI_OCR_MODEL = originalModel;
});

describe('runKycOcr', () => {
  it('keeps Chinese passport OCR disabled unless the explicit sample-evaluation gate is enabled', async () => {
    configure();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const passport = input({ documentType: 'passport', back: undefined, enteredDocumentNumber: 'EA1234567' });
    await expect(extractKycPreviewFields(passport)).resolves.toMatchObject({ status: 'unavailable', failureCode: 'configuration' });
    await expect(runKycOcr(passport)).resolves.toMatchObject({ status: 'unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('matches a passport only when MRZ, country, number, name and visible-field checks agree', async () => {
    configure();
    vi.stubEnv('KYC_CHINESE_PASSPORT_OCR_ENABLED', 'true');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(privateResponse(JSON.stringify({
      holderName: 'LI WEI MING', documentNumber: 'EA1234567', expiryDate: '2030-01-01', confidence: 0.99, unreadable: false,
      issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', visualComparisonStatus: 'consistent', visualMismatchFields: [],
    })));
    await expect(runKycOcr(input({ documentType: 'passport', back: undefined, enteredDocumentNumber: 'EA1234567', expectedHolderName: 'LI WEI MING' })))
      .resolves.toMatchObject({ status: 'matched', expiryDate: '2030-01-01', issuerCountry: 'CN', nationality: 'CN', mrzStatus: 'valid', visualComparisonStatus: 'consistent' });
  });

  it('returns full extracted number only in the temporary owner preview result', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(privateResponse(JSON.stringify({
      holderName: 'Aminah Ali', documentNumber: '900101-14-1234', expiryDate: null, confidence: 0.91, unreadable: false,
    })));
    await expect(extractKycPreviewFields(input())).resolves.toMatchObject({
      status: 'extracted', holderName: 'Aminah Ali', documentNumber: '900101-14-1234', providerModel: 'private-ocr-v1',
    });
  });

  it('never sends evidence to a provider without explicit operator opt-in', async () => {
    delete process.env.KYC_EXTERNAL_OCR_ENABLED;
    process.env.GOOGLE_AI_KEY = 'test-key';
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(runKycOcr(input())).resolves.toMatchObject({ status: 'unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('records only a masked mismatching document number and no raw model text', async () => {
    configure();
    process.env.GOOGLE_AI_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(privateResponse(JSON.stringify({
      holderName: 'Aminah Ali', documentNumber: '900101-14-1235', expiryDate: null, confidence: 0.91, unreadable: false,
    })));

    const result = await runKycOcr(input());

    expect(result).toMatchObject({
      status: 'mismatch', holderName: 'Aminah Ali', documentNumberLast4: '1235', mismatchFields: ['document_number'], confidence: 0.91,
    });
    expect(result.documentNumberHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty('rawText');
    expect(result).not.toHaveProperty('documentNumber');
  });

  it('returns unavailable rather than throwing when private OCR rejects the request', async () => {
    configure();
    process.env.GOOGLE_AI_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(privateResponse('', false, 429));

    await expect(runKycOcr(input())).resolves.toMatchObject({ status: 'unavailable' });
  });
});
