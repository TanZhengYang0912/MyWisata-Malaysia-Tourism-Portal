import { expect, it, vi } from 'vitest';
import { verifySyntheticOcr } from '../verify-kyc-node-ocr.mjs';
it('rejects arbitrary targets and never runs without explicit opt-in', async () => {
  const fetch = vi.fn();
  await expect(verifySyntheticOcr({ origin: 'https://evil.test', runSynthetic: true, manifest: {}, secret: 'secret' }, fetch)).rejects.toThrow();
  await expect(verifySyntheticOcr({ origin: 'https://mylawatan.my', runSynthetic: false, manifest: {}, secret: 'secret' }, fetch)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('accepts the fixed child-no-response stage and stops on the first failure', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, failureCode: 'service_unavailable', failureStage: 'child_no_response' }), { status: 503 }));
  await expect(verifySyntheticOcr({ origin: 'http://127.0.0.1:3000', runSynthetic: true, manifest: {}, secret: 'secret' }, fetch))
    .resolves.toEqual({ ok: false, failureCode: 'service_unavailable', failureStage: 'child_no_response' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects unallowlisted failure details from a probe response', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, failureCode: 'service_unavailable', failureStage: '/private/path' }), { status: 503 }));
  await expect(verifySyntheticOcr({ origin: 'http://127.0.0.1:3000', runSynthetic: true, manifest: {}, secret: 'secret' }, fetch)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
