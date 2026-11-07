import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateListingSuggestion } from '@/lib/ai/listing-suggestions';

describe('listing suggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses Gemini and parses the product-listing suggestion', async () => {
    vi.stubEnv('LLM_API_KEY', 'gemini-test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        title: 'Penang Tau Sar Pneah',
        description: 'Traditional pastries made in Penang.',
        category: 'Food',
        tags: ['Penang', 'pastry'],
      }) }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateListingSuggestion({
      name: 'Tau Sar Pneah', productType: 'Food', location: 'Penang',
    })).resolves.toEqual({
      available: true,
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      suggestion: {
        title: 'Penang Tau Sar Pneah',
        description: 'Traditional pastries made in Penang.',
        category: 'Food',
        tags: ['Penang', 'pastry'],
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-token' }) }),
    );
  });
});
