import type { SupabaseClient } from '@supabase/supabase-js';

export interface UnansweredQuestion {
  question: string;
  count: number;
  lastAskedAt: string;
}

export interface ChatbotAdminStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number;
  topUnanswered: UnansweredQuestion[];
  notHelpfulAnswered: UnansweredQuestion[];
  escalationRate: number;
  topEscalated: UnansweredQuestion[];
  pairedUnansweredCount: number;
  legacyUnpairedCount: number;
  range: { from: string; to: string };
}

const DEFAULT_RANGE_DAYS = 30;

export async function getChatbotAdminStats(
  service: SupabaseClient,
  range: { from?: Date; to?: Date } = {},
): Promise<ChatbotAdminStats> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    throw new Error('Invalid chatbot stats range');
  }

  const { data, error } = await service.rpc('get_customer_chatbot_stats', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !data) throw new Error('Customer chatbot stats are unavailable');
  return data as ChatbotAdminStats;
}
