// P4 — Member 4: chatbot FAQ shortcuts.
// GET /api/chatbot/faq — the active knowledge-base entries grouped by
// category, for the widget's "Common questions" browser (category button ->
// question list -> tap to ask).
//
// Derived from chatbot_kb_documents rather than a separate hardcoded list,
// deliberately: the KB titles ARE the questions the bot can answer, so every
// suggested question is guaranteed to produce a real answer instead of the
// "Sorry, I don't know that one" path — and the list stays in sync
// automatically whenever an admin adds/edits/deactivates a KB entry
// (app/admin/chatbot). A second hardcoded list would drift from the KB the
// first time anyone edited either one.
//
// Cookie-aware client on purpose: chatbot_kb_documents carries a real
// public-read RLS policy scoped to is_active = true
// (007_public_read_policies.sql: chatbot_kb_public_read), so Postgres itself
// enforces "active only" here — the explicit .eq('is_active', true) below is
// belt-and-braces so this behaves identically if ever called with a
// service-role client. No auth required, matching POST /api/chatbot/ask,
// which also serves anonymous visitors.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export interface FaqQuestion {
  id: string;
  question: string;
}

export interface FaqCategory {
  category: string;
  questions: FaqQuestion[];
}

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chatbot_kb_documents')
    .select('id, title, category')
    .eq('is_active', true)
    .order('category')
    .order('title');

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Uncategorised KB entries fall into 'general' rather than their own
  // "null" bucket — category is nullable in the schema and a blank chip
  // would be meaningless to a user.
  const byCategory = new Map<string, FaqQuestion[]>();
  for (const row of data ?? []) {
    const category = row.category ?? 'general';
    const list = byCategory.get(category) ?? [];
    list.push({ id: row.id as string, question: row.title as string });
    byCategory.set(category, list);
  }

  const categories: FaqCategory[] = [...byCategory.entries()]
    .map(([category, questions]) => ({ category, questions }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return apiOk({ categories });
}
