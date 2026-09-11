import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getChatbotAdminStats } from '../admin-stats';

function makeService(messages: unknown[], feedback: unknown[]) {
  const messagesQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };
  // Two chained .order() calls in the real query — the second must resolve.
  messagesQuery.order = vi.fn()
    .mockReturnValueOnce(messagesQuery)
    .mockResolvedValueOnce({ data: messages, error: null });
  const feedbackQuery = { select: vi.fn().mockResolvedValue({ data: feedback, error: null }) };
  const service = {
    from: vi.fn((table: string) => (table === 'chatbot_messages' ? messagesQuery : feedbackQuery)),
  } as unknown as SupabaseClient;
  return service;
}

describe('getChatbotAdminStats', () => {
  it('ranks the questions that most often ended in a support ticket, distinct from unanswered/not-helpful', async () => {
    const feedback = [
      { question: 'How do I get a refund?', bot_answered: true, helpful: false, opened_ticket: true, created_at: '2026-09-01T00:00:00Z' },
      { question: 'How do I get a refund?', bot_answered: true, helpful: false, opened_ticket: true, created_at: '2026-09-02T00:00:00Z' },
      { question: 'Why was my withdrawal delayed?', bot_answered: false, helpful: null, opened_ticket: true, created_at: '2026-09-03T00:00:00Z' },
      // Failed but never escalated — must not appear in topEscalated.
      { question: 'What is the weather like?', bot_answered: false, helpful: null, opened_ticket: false, created_at: '2026-09-04T00:00:00Z' },
    ];
    const service = makeService([], feedback);

    const stats = await getChatbotAdminStats(service);

    expect(stats.topEscalated.map((q) => q.question)).toEqual(['How do I get a refund?', 'Why was my withdrawal delayed?']);
    expect(stats.topEscalated[0].count).toBe(2);
    expect(stats.topEscalated.some((q) => q.question === 'What is the weather like?')).toBe(false);
  });

  it('returns an empty topEscalated when nothing was ever escalated', async () => {
    const service = makeService([], [
      { question: 'How do bookings work?', bot_answered: true, helpful: true, opened_ticket: false, created_at: '2026-09-01T00:00:00Z' },
    ]);
    const stats = await getChatbotAdminStats(service);
    expect(stats.topEscalated).toEqual([]);
  });
});
