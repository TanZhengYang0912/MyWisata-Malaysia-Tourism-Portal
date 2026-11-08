import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '@/lib/admin-ai/gemini';

describe('callGemini multimodal payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('rejects image payloads until their personal-data content can be checked safely', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(callGemini('system', 'Private family plan.', {
      images: [{ id: 'image-1', mimeType: 'image/jpeg', data: 'base64-image-data' }],
    })).rejects.toThrow('image_privacy_review_required');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('reports sensitive input before checking whether Gemini is configured', async () => {
    delete process.env.LLM_API_KEY;
    await expect(callGemini('system', 'Call me at 012-3456789')).rejects.toThrow('sensitive_data_detected');
  });

});

describe('callGemini text source', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('lets the admin assistant ask about KYC, but keeps the full check for every other caller', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(callGemini('system', 'How many KYC submissions are pending?', { textSource: 'staff' })).resolves.toBe('ok');
    await expect(callGemini('system', 'How many KYC submissions are pending?')).rejects.toThrow('sensitive_data_detected');
    await expect(callGemini('system', 'KYC for 990101-14-5678 please', { textSource: 'staff' })).rejects.toThrow('sensitive_data_detected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
