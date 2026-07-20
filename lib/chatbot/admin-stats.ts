// P4 — Member 4: chatbot admin stats. CLAUDE-PHASE2.md Feature A,
// "Also on /admin/chatbot" — total questions, answer rate, top unanswered
// questions (the FAQs the team should write next).
//
// CLAUDE-CHATBOT-FEEDBACK.md: extended with the new customer-feedback
// signal — notHelpfulAnswered ("the answer exists but is bad", distinct
// from topUnanswered's "no answer at all") and escalationRate (how often a
// failed answer actually turns into a ticket). Sourced from
// chatbot_feedback, which already stores `question` as a plain column, so
// this doesn't need topUnanswered's message-pairing walk — one query.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalize } from './match';

const TOP_LIMIT = 10;

export interface UnansweredQuestion {
  question: string;
  count: number;
  lastAskedAt: string;
}

export interface ChatbotAdminStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number; // 0..1
  topUnanswered: UnansweredQuestion[];
  /** Bot DID answer, but the customer said it wasn't helpful — the KB doc exists but needs improving. */
  notHelpfulAnswered: UnansweredQuestion[];
  /** Of every "the bot failed the customer" case (unanswered OR not-helpful), the fraction that became a ticket. */
  escalationRate: number; // 0..1
}

function topByCount(
  rows: { question: string; created_at: string }[],
): UnansweredQuestion[] {
  const byNormalized = new Map<string, { example: string; count: number; lastAskedAt: string }>();
  for (const row of rows) {
    if (!row.question) continue;
    const key = normalize(row.question);
    const entry = byNormalized.get(key) ?? { example: row.question, count: 0, lastAskedAt: row.created_at };
    entry.count += 1;
    if (row.created_at > entry.lastAskedAt) entry.lastAskedAt = row.created_at;
    byNormalized.set(key, entry);
  }
  return [...byNormalized.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT)
    .map((e) => ({ question: e.example, count: e.count, lastAskedAt: e.lastAskedAt }));
}

export async function getChatbotAdminStats(service: SupabaseClient): Promise<ChatbotAdminStats> {
  // This view is specifically the CUSTOMER-facing FAQ bot's gaps — filtered
  // to chatbot_sessions.channel = 'customer' (migration 034) so questions
  // asked through the separate admin AI assistant (/admin/ai-assistant,
  // channel='admin') never leak into "top unanswered questions" or the
  // answer rate. Found live: without this filter, an admin's own testing
  // of the admin assistant (e.g. "how many orders has X placed") was
  // showing up here as if a customer had asked it. Embedded-filter join,
  // same !inner pattern used elsewhere in this codebase (e.g.
  // lib/admin-ai/queries.ts's usersTotal). chatbot_feedback needs no
  // equivalent filter — only the customer widget ever calls
  // POST /api/chatbot/feedback, so every row in that table is already
  // customer-channel by construction.
  const [{ data: messagesData }, { data: feedbackData }] = await Promise.all([
    service
      .from('chatbot_messages')
      .select('session_id, role, body, kb_matched, created_at, chatbot_sessions!inner(channel)')
      .eq('chatbot_sessions.channel', 'customer')
      .order('session_id', { ascending: true })
      .order('created_at', { ascending: true }),
    service.from('chatbot_feedback').select('question, bot_answered, helpful, opened_ticket, created_at'),
  ]);
  const messages = messagesData ?? [];
  const feedback = feedbackData ?? [];

  const totalQuestions = messages.filter((m) => m.role === 'user').length;
  const botMessages = messages.filter((m) => m.role === 'bot');
  const answeredCount = botMessages.filter((m) => m.kb_matched).length;
  const answerRate = botMessages.length > 0 ? answeredCount / botMessages.length : 0;

  // Walk each session in order, pairing each unanswered bot reply with the
  // user question immediately before it — messages are always inserted
  // user-then-bot per turn (app/api/chatbot/ask/route.ts), so this is a
  // reliable pairing without needing a dedicated "in reply to" column.
  const unansweredByNormalized = new Map<string, { example: string; count: number; lastAskedAt: string }>();
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
      const entry = unansweredByNormalized.get(key) ?? { example: lastUserQuestion, count: 0, lastAskedAt: m.created_at };
      entry.count += 1;
      entry.lastAskedAt = m.created_at; // messages are ascending-ordered, so the latest match always wins
      unansweredByNormalized.set(key, entry);
      lastUserQuestion = null; // consumed — don't double-count if two bot rows somehow follow
    }
  }

  const topUnanswered = [...unansweredByNormalized.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LIMIT)
    .map((e) => ({ question: e.example, count: e.count, lastAskedAt: e.lastAskedAt }));

  const notHelpfulRows = feedback
    .filter((f): f is typeof f & { question: string } => f.bot_answered === true && f.helpful === false && Boolean(f.question))
    .map((f) => ({ question: f.question, created_at: f.created_at }));
  const notHelpfulAnswered = topByCount(notHelpfulRows);

  // "The bot failed the customer" = it never answered, or it answered but
  // they said it wasn't helpful. Of those, how many actually got escalated.
  const failedRows = feedback.filter((f) => f.bot_answered === false || f.helpful === false);
  const escalatedRows = failedRows.filter((f) => f.opened_ticket);
  const escalationRate = failedRows.length > 0 ? escalatedRows.length / failedRows.length : 0;

  return { totalQuestions, answeredCount, answerRate, topUnanswered, notHelpfulAnswered, escalationRate };
}
