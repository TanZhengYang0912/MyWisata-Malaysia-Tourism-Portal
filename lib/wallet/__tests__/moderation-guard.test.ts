import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  moderateWalletReason: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.from })),
}));

vi.mock('@/lib/moderation', () => ({
  moderateWalletReason: mocks.moderateWalletReason,
}));

import { moderateWalletAction } from '../moderation-guard';

function rateQuery(count = 0) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.then = (
    resolve: (value: { count: number; error: null }) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve({ count, error: null }).then(resolve, reject);
  query.insert = mocks.insert;
  return query;
}

describe('moderateWalletAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue(rateQuery());
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('allows a clean reason when AI relevance is false and preserves the advisory audit result', async () => {
    mocks.moderateWalletReason.mockResolvedValue({
      flagged: false,
      relevant: false,
      professional: true,
      categories: [],
      advisoryMessage: 'Explain which review evidence supports this decision.',
    });

    await expect(moderateWalletAction({
      actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      withdrawalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      action: 'approve',
      reasonCategory: 'review_completed',
      reason: 'KYC verified and the withdrawal review is completed.',
    })).resolves.toEqual({
      ok: true,
      categories: [],
      advisory: { reasons: ['relevance'], message: 'Explain which review evidence supports this decision.' },
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'approve',
      reason_category: 'review_completed',
      result: 'irrelevant',
    }));
  });

  it('continues to reject prohibited content', async () => {
    mocks.moderateWalletReason.mockResolvedValue({
      flagged: true,
      relevant: true,
      professional: false,
      categories: ['harassment'],
      advisoryMessage: null,
    });

    await expect(moderateWalletAction({
      actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'approve',
      reasonCategory: 'review_completed',
      reason: 'A prohibited approval note.',
    })).resolves.toMatchObject({ ok: false, code: 'CONTENT_REJECTED' });
  });

  it('allows an unprofessional but safe reason with an advisory', async () => {
    mocks.moderateWalletReason.mockResolvedValue({
      flagged: false,
      relevant: true,
      professional: false,
      categories: ['tone'],
      advisoryMessage: 'Use neutral, factual language.',
    });

    await expect(moderateWalletAction({
      actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'reject',
      reasonCategory: 'other',
      reason: 'This request is careless and should not proceed.',
    })).resolves.toEqual({
      ok: true,
      categories: ['tone'],
      advisory: { reasons: ['tone'], message: 'Use neutral, factual language.' },
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ result: 'accepted' }));
  });

  it('continues to fail closed when moderation is unavailable', async () => {
    mocks.moderateWalletReason.mockResolvedValue({ error: 'api_unavailable' });

    await expect(moderateWalletAction({
      actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'approve',
      reasonCategory: 'review_completed',
      reason: 'Review completed and ready for payout.',
    })).resolves.toMatchObject({ ok: false, code: 'MODERATION_UNAVAILABLE' });
  });
});
