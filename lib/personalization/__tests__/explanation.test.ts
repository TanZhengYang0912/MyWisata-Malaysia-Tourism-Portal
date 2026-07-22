import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { describeFit } from '@/lib/personalization/explanation';

const input = {
  preferences: { interests: ['food'], budgetRange: 'budget', mobilityNeeds: 'none', preferredDistance: 'nearby' },
  activity: { name: 'Penang food walk', category: 'Food & Dining', description: 'Public itinerary', tags: ['food'], price: 40 },
};

describe('describeFit', () => {
  const originalKey = process.env.GOOGLE_AI_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GOOGLE_AI_KEY;
    else process.env.GOOGLE_AI_KEY = originalKey;
  });

  it('uses a deterministic explanation when Gemini is unavailable', async () => {
    delete process.env.GOOGLE_AI_KEY;

    await expect(describeFit(input)).resolves.toContain('matches your');
  });

  it('sends only public activity information and labels to Gemini', async () => {
    process.env.GOOGLE_AI_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A concise public recommendation.' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(describeFit(input)).resolves.toBe('A concise public recommendation.');
    const body = JSON.stringify(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).toContain('Penang food walk');
    expect(body).not.toContain('email');
    expect(body).not.toContain('phone');
  });
});
