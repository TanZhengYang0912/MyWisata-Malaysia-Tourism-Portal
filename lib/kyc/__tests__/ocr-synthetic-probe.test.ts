import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock('../node-ocr-engine', () => ({ extractKycFieldsInNode: mocks.extract }));

import { runKycSyntheticProbe } from '../ocr-synthetic-probe';

beforeEach(() => {
  vi.stubEnv('KYC_OCR_ENGINE', 'tesseract-js');
  vi.stubEnv('KYC_NODE_OCR_TIMEOUT_MS', '20000');
  mocks.extract.mockReset();
});

it('returns only allowlisted OCR failure details for the protected synthetic probe', async () => {
  mocks.extract.mockResolvedValue({ ok: false, failureCode: 'service_unavailable', retryable: true, failureStage: 'worker_initialize' });

  await expect(runKycSyntheticProbe()).resolves.toEqual({
    ok: false,
    failureCode: 'service_unavailable',
    failureStage: 'worker_initialize',
  });
});

it('does not return arbitrary child failure text from the synthetic probe', async () => {
  mocks.extract.mockResolvedValue({ ok: false, failureCode: 'service_unavailable', retryable: true,
    failureStage: 'unexpected_child_error', error: 'private raw exception text' });

  const result = await runKycSyntheticProbe();

  expect(JSON.stringify(result)).not.toContain('SYNTHETIC PERSON');
  expect(JSON.stringify(result)).not.toContain('990101');
  expect(JSON.stringify(result)).not.toContain('private raw exception text');
  expect(Object.keys(result)).toEqual(['ok', 'failureCode', 'failureStage']);
});
