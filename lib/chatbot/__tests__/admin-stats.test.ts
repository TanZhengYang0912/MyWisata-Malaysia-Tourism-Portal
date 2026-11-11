import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getChatbotAdminStats } from '../admin-stats';

function makeService(result: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  return { service: { rpc } as unknown as SupabaseClient, rpc };
}

describe('getChatbotAdminStats', () => {
  it('uses a bounded database aggregation and preserves paired versus legacy coverage', async () => {
    const stats = {
      totalQuestions: 12,
      answeredCount: 8,
      answerRate: 0.8,
      topUnanswered: [{ question: 'Refund update?', count: 2, lastAskedAt: '2026-09-02T00:00:00Z' }],
      notHelpfulAnswered: [],
      escalationRate: 0.25,
      topEscalated: [],
      pairedUnansweredCount: 2,
      legacyUnpairedCount: 4,
      range: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
    };
    const { service, rpc } = makeService(stats);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-10-01T00:00:00.000Z');

    await expect(getChatbotAdminStats(service, { from, to })).resolves.toEqual(stats);
    expect(rpc).toHaveBeenCalledWith('get_customer_chatbot_stats', { p_from: from.toISOString(), p_to: to.toISOString() });
  });

  it('throws on an unavailable aggregate instead of reporting zero', async () => {
    const { service } = makeService(null, { message: 'db unavailable' });
    await expect(getChatbotAdminStats(service)).rejects.toThrow('Customer chatbot stats are unavailable');
  });
});
