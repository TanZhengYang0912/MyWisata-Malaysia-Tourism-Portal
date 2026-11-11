import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draftKbEntry } from '../kb-draft';

function geminiResponse(text: string) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200 });
}

describe('draftKbEntry without a verified answer', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('rejects a specific answer when no reviewed facts were supplied', async () => {
    vi.mocked(fetch).mockResolvedValue(geminiResponse(
      'TITLE: Refund timing\nBODY: Refunds are processed within five business days.\nKEYWORDS: refund, timing',
    ));

    await expect(draftKbEntry('When will my refund arrive?', null)).resolves.toBeNull();
  });

  it('keeps an explicit review placeholder when no verified answer exists', async () => {
    vi.mocked(fetch).mockResolvedValue(geminiResponse(
      'TITLE: Refund timing\nBODY: [ADMIN: confirm the refund processing time].\nKEYWORDS: refund, timing',
    ));

    await expect(draftKbEntry('When will my refund arrive?', null)).resolves.toEqual({
      title: 'Refund timing',
      body: '[ADMIN: confirm the refund processing time].',
      keywords: ['refund', 'timing'],
    });
  });
});
