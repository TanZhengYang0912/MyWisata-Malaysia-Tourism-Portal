import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '@/lib/admin-ai/gemini';

describe('callGemini multimodal payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
  });

  it('redacts text and sends inline images without logging image data', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await callGemini('system', 'Email: person@example.com', {
      images: [{ id: 'image-1', mimeType: 'image/jpeg', data: 'base64-image-data' }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.contents[0].parts).toEqual([
      { text: expect.not.stringContaining('person@example.com') },
      { text: 'Photo ID: image-1' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64-image-data' } },
    ]);
    expect(log.mock.calls.flat().join(' ')).not.toContain('base64-image-data');
    log.mockRestore();
  });
});
