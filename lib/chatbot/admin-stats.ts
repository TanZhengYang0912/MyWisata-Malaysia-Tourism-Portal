// P4 — Member 4: chatbot admin stats. CLAUDE-PHASE2.md Feature A,
// "Also on /admin/chatbot" — total questions, answer rate, top unanswered
// questions (the FAQs the team should write next).

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalize } from './match';

const TOP_UNANSWERED_LIMIT = 10;

export interface UnansweredQuestion {
  question: string;
  count: number;
}

export interface ChatbotAdminStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number; // 0..1
  topUnanswered: UnansweredQuestion[];
}

export async function getChatbotAdminStats(service: SupabaseClient): Promise<ChatbotAdminStats> {
  const { data } = await service
    .from('chatbot_messages')
    .select('session_id, role, body, kb_matched, created_at')
    .order('session_id', { ascending: true })
    .order('created_at', { ascending: true });
  const messages = data ?? [];

  const totalQuestions = messages.filter((m) => m.role === 'user').length;
  const botMessages = messages.filter((m) => m.role === 'bot');
  const answeredCount = botMessages.filter((m) => m.kb_matched).length;
  const answerRate = botMessages.length > 0 ? answeredCount / botMessages.length : 0;

  // Walk each session in order, pairing each unanswered bot reply with the
  // user question immediately before it — messages are always inserted
  // user-then-bot per turn (app/api/chatbot/ask/route.ts), so this is a
  // reliable pairing without needing a dedicated "in reply to" column.
  const unansweredByNormalized = new Map<string, { example: string; count: number }>();
  let lastUserQuestion: string | null = null;
  let lastSessionId: string | null = null;

  for (const m of messages) {
    if (m.session_id !== lastSessionId) {
      lastUserQuestion = null;
      lastSessionId = m.session_id;
    }
    if (m.role === 'user') {
      lastUserQuestion = m.body;
    } else if (m.role === 'bot' && !m.kb_matched && lastUserQuestion) {
      const key = normalize(lastUserQuestion);
      const entry = unansweredByNormalized.get(key) ?? { example: lastUserQuestion, count: 0 };
      entry.count += 1;
      unansweredByNormalized.set(key, entry);
      lastUserQuestion = null; // consumed — don't double-count if two bot rows somehow follow
    }
  }

  const topUnanswered = [...unansweredByNormalized.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_UNANSWERED_LIMIT)
    .map((e) => ({ question: e.example, count: e.count }));

  return { totalQuestions, answeredCount, answerRate, topUnanswered };
}
