import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  generateAnswer: vi.fn(),
  kbRows: [] as { id: string; title: string; body: string; keywords: string[]; category: string | null }[],
}));

vi.mock('../retrieve', () => ({ retrieve: mocks.retrieve }));
vi.mock('../generate', () => ({ generateAnswer: mocks.generateAnswer }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: mocks.kbRows }) }) }),
  }),
}));

import { answerQuestion } from '../answer';

const doc = (id: string, similarity: number) => ({ id, title: id, body: `${id} body`, category: null, similarity });

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
    expect(mocks.generateAnswer).toHaveBeenCalledWith('How do I withdraw my earnings?', [doc('wallet', 0.9)], 1);
    expect(result.kbMatched).toBe(true);
  });

  it('searches each question separately and merges the docs', async () => {
    mocks.retrieve
      .mockResolvedValueOnce([doc('wallet', 0.9), doc('shared', 0.78)])
      .mockResolvedValueOnce([doc('booking', 0.88), doc('shared', 0.8)]);
    mocks.generateAnswer.mockResolvedValue('Both answered.');

    const question = 'How do I withdraw my earnings? Can I cancel a booking?';
    const result = await answerQuestion(question);

    expect(mocks.retrieve.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ['How do I withdraw my earnings', 2],
      ['Can I cancel a booking', 2],
    ]);
    expect(mocks.generateAnswer).toHaveBeenCalledWith(question, [doc('wallet', 0.9), doc('booking', 0.88), doc('shared', 0.8)], 2);
    expect(result).toMatchObject({ answer: 'Both answered.', kbMatched: true, mode: 'llm' });
    expect(result.usedKb.map((ref) => ref.id)).toEqual(['wallet', 'booking', 'shared']);
  });

  it('still answers the covered question when another finds nothing', async () => {
    mocks.retrieve.mockResolvedValueOnce([doc('wallet', 0.9)]).mockResolvedValueOnce([]);
    mocks.generateAnswer.mockResolvedValue('Withdraw from Wallet. I do not have information about parking.');

    const result = await answerQuestion('How do I withdraw my earnings? Where can I park my car?');

    expect(mocks.generateAnswer).toHaveBeenCalledTimes(1);
    expect(result.kbMatched).toBe(true);
  });

  it('falls back without calling the model when no question finds a doc', async () => {
    mocks.retrieve.mockResolvedValue([]);

    const result = await answerQuestion('Where can I park my car? Is it raining today?');

    expect(mocks.generateAnswer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kbMatched: false, canEscalate: true });
  });

  it('keyword fallback answers each question once', async () => {
    delete process.env.LLM_API_KEY;
    mocks.kbRows = [
      { id: 'wallet', title: 'Wallet', body: 'Withdraw from Wallet.', keywords: ['withdraw', 'earnings'], category: null },
      { id: 'booking', title: 'Booking', body: 'Cancel from Bookings.', keywords: ['cancel', 'booking'], category: null },
    ];

    const result = await answerQuestion('How do I withdraw my earnings? Can I cancel a booking? Can I cancel my booking today?');

    expect(result).toMatchObject({ answer: 'Withdraw from Wallet.\n\nCancel from Bookings.', kbMatched: true, mode: 'keyword' });
    expect(result.usedKb).toEqual([{ id: 'wallet', similarity: null }, { id: 'booking', similarity: null }]);
  });
});
