import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  generateAnswer: vi.fn(),
  kbRows: [] as { id: string; title: string; body: string; keywords: string[]; category: string | null; content_version: number; published_source_refs?: unknown[] }[],
}));

vi.mock('../retrieve', () => ({ retrieve: mocks.retrieve }));
vi.mock('../generate', () => ({ generateAnswer: mocks.generateAnswer }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: mocks.kbRows }) }) }),
  }),
}));

import { answerQuestion } from '../answer';

const doc = (id: string, similarity: number) => ({ id, title: id, body: `${id} body`, category: null, similarity, contentVersion: 2, reviewed: true });

describe('answerQuestion with several questions', () => {
  beforeEach(() => {
    process.env.LLM_API_KEY = 'test-key';
    mocks.retrieve.mockReset();
    mocks.generateAnswer.mockReset();
    mocks.kbRows = [];
  });
  afterEach(() => {
    delete process.env.LLM_API_KEY;
  });

  it('searches a single question once with three docs, as before', async () => {
    mocks.retrieve.mockResolvedValue([doc('wallet', 0.9)]);
    mocks.generateAnswer.mockResolvedValue('Withdraw from Wallet.');

    const result = await answerQuestion('How do I withdraw my earnings?');

    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
    expect(mocks.retrieve.mock.calls[0][2]).toBe(3);
    expect(mocks.retrieve.mock.calls[0][4]).toBe(true);
    expect(mocks.generateAnswer).toHaveBeenCalledWith('How do I withdraw my earnings?', [doc('wallet', 0.9)], 1);
    expect(result.kbMatched).toBe(true);
  });

  it('searches each question separately and merges the docs', async () => {
    mocks.retrieve
      .mockResolvedValueOnce([doc('wallet', 0.9), doc('shared', 0.78)])
      .mockResolvedValueOnce([doc('booking', 0.88), doc('shared', 0.8)]);
    mocks.generateAnswer.mockResolvedValue('Booking answer.');

    const question = 'How do I withdraw my earnings? Can I cancel a booking?';
    const result = await answerQuestion(question);

    expect(mocks.retrieve.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['How do I withdraw my earnings', 2],
      ['Can I cancel a booking', 2],
    ]);
    expect(mocks.retrieve.mock.calls.map((call) => call[4])).toEqual([true, false]);
    expect(mocks.generateAnswer).toHaveBeenCalledWith('Can I cancel a booking', [doc('booking', 0.88), doc('shared', 0.8)], 1);
    expect(result).toMatchObject({ answer: 'wallet body\n\nBooking answer.', kbMatched: true, mode: 'llm' });
    expect(result.usedKb.map((ref) => ref.id)).toEqual(['wallet', 'booking', 'shared']);
  });

  it('does not use a general question match as evidence for an unanswered sensitive question', async () => {
    mocks.retrieve.mockResolvedValueOnce([]).mockResolvedValueOnce([doc('booking', 0.88)]);
    mocks.generateAnswer.mockResolvedValue('Cancel from Bookings.');

    const result = await answerQuestion('What is your refund policy? Can I cancel a booking?');

    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kbMatched: false, canEscalate: true, usedKb: [] });
    expect(result.answer).toMatch(/can't confirm|无法根据|tidak dapat mengesahkan/i);
  });

  it('marks the first provider call once across parallel embeddings and generation', async () => {
    const events: string[] = [];
    const beforeExternalCall = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push('marked');
    });
    mocks.retrieve.mockImplementation(async (_service, _question, _count, beforeCall) => {
      await beforeCall?.();
      events.push('embedded');
      return [doc(_question, 0.9)];
    });
    mocks.generateAnswer.mockImplementation(async (_question, _docs, _count, beforeCall) => {
      await beforeCall?.();
      events.push('generated');
      return 'Both answered.';
    });

    await answerQuestion('How do I withdraw my earnings? Can I cancel a booking?', true, beforeExternalCall);

    expect(beforeExternalCall).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['marked', 'embedded', 'embedded', 'generated']);
  });

  it('still answers the covered question when another finds nothing', async () => {
    mocks.retrieve.mockResolvedValueOnce([doc('wallet', 0.9)]).mockResolvedValueOnce([]);

    const result = await answerQuestion('How do I withdraw my earnings? Where can I park my car?');

    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(result.answer).toContain('wallet body');
    expect(result.kbMatched).toBe(true);
    expect(result.canEscalate).toBe(true);
  });

  it('falls back without calling the model when no question finds a doc', async () => {
    mocks.retrieve.mockResolvedValue([]);

    const result = await answerQuestion('Where can I park my car? Is it raining today?');

    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kbMatched: false, canEscalate: true });
  });

  it('does not invent a live stock or payment-configuration answer when no reviewed source matches', async () => {
    mocks.retrieve.mockResolvedValue([]);

    const result = await answerQuestion('The tour is sold out. Can you reserve a place, and is the payment setup broken?');

    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kbMatched: false, canEscalate: true, usedKb: [] });
    expect(result.answer).not.toMatch(/reserve|payment setup|available/i);
  });

  it('keyword fallback answers each question once', async () => {
    delete process.env.LLM_API_KEY;
    mocks.kbRows = [
      { id: 'wallet', title: 'Wallet', body: 'Withdraw from Wallet.', keywords: ['withdraw', 'earnings'], category: null, content_version: 3, published_source_refs: [{ source: 'approved-wallet-policy' }] },
      { id: 'booking', title: 'Booking', body: 'Cancel from Bookings.', keywords: ['cancel', 'booking'], category: null, content_version: 4, published_source_refs: [{ source: 'approved-booking-policy' }] },
    ];

    const result = await answerQuestion('How do I withdraw my earnings? Can I cancel a booking? Can I cancel my booking today?');

    expect(result).toMatchObject({ answer: 'Withdraw from Wallet.\n\nCancel from Bookings.', kbMatched: true, mode: 'keyword' });
    expect(result.usedKb).toEqual([
      { id: 'wallet', title: 'Wallet', contentVersion: 3, reviewed: true, similarity: null },
      { id: 'booking', title: 'Booking', contentVersion: 4, reviewed: true, similarity: null },
    ]);
  });

  it('keeps sensitive keyword fallback tied to active published articles and their version', async () => {
    mocks.kbRows = [{
      id: 'refund-policy', title: 'Refund requests', body: 'Contact Support for a refund update.',
      keywords: ['refund'], category: 'payment', content_version: 7, published_source_refs: [{ source: 'approved-policy' }],
    }];

    const result = await answerQuestion('What is your refund policy?', false);

    expect(result).toMatchObject({
      answer: 'Contact Support for a refund update.',
      kbMatched: true,
      mode: 'keyword',
      usedKb: [{ id: 'refund-policy', title: 'Refund requests', contentVersion: 7, reviewed: true, similarity: null }],
    });
  });

  it('does not answer a sensitive keyword query from a legacy active article without review sources', async () => {
    delete process.env.LLM_API_KEY;
    mocks.kbRows = [{
      id: 'legacy-refund', title: 'Refund requests', body: 'Refunds take five days.',
      keywords: ['refund'], category: 'payment', content_version: 1, published_source_refs: [],
    }];

    const result = await answerQuestion('What is your refund policy?', false);

    expect(result).toMatchObject({ mode: 'keyword', kbMatched: false, canEscalate: true, usedKb: [] });
    expect(result.answer).toMatch(/can't confirm|无法根据|tidak dapat mengesahkan/i);
  });

  it('keeps ordinary keyword results when a mixed query also needs reviewed evidence', async () => {
    delete process.env.LLM_API_KEY;
    mocks.kbRows = [
      { id: 'refund-policy', title: 'Refund policy', body: 'Contact Support for refund updates.', keywords: ['refund'], category: 'payment', content_version: 3, published_source_refs: [{ source: 'approved-policy' }] },
      { id: 'booking', title: 'Booking', body: 'Cancel from Bookings.', keywords: ['cancel', 'booking'], category: null, content_version: 4, published_source_refs: [] },
    ];

    const result = await answerQuestion('What is your refund policy? Can I cancel a booking?', false);

    expect(result).toMatchObject({
      answer: 'Contact Support for refund updates.\n\nCancel from Bookings.',
      kbMatched: true,
      mode: 'keyword',
    });
    expect(result.usedKb.map((ref) => [ref.id, ref.reviewed])).toEqual([
      ['refund-policy', true],
      ['booking', false],
    ]);
  });
});
