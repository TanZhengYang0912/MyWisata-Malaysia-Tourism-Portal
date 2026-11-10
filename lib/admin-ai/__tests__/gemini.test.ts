import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini, callGeminiAgent } from '@/lib/admin-ai/gemini';

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

describe('callGeminiAgent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('checks tool results as well as questions, and echoes the model turn back unchanged', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const modelParts = [{ functionCall: { name: 'run_query', args: { query: 'kyc_pending_count' } }, thoughtSignature: 'sig' }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: modelParts } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const turn = await callGeminiAgent('system', [{ role: 'user', parts: [{ text: 'How many KYC submissions are pending?' }] }], []);
    expect(turn.calls).toEqual([modelParts[0].functionCall]);
    expect(turn.content.parts).toEqual(modelParts);

    const leakingResult = { role: 'user' as const, parts: [{ functionResponse: { name: 'run_query', response: { phone: '012-3456789' } } }] };
    await expect(callGeminiAgent('system', [leakingResult], [])).rejects.toThrow('sensitive_data_detected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
