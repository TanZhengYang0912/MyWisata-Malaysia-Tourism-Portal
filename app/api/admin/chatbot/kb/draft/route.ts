// P4 — Member 4: AI-drafted KB entries (CLAUDE-P4-EXTRAS-2.md Extra 5)
// POST /api/admin/chatbot/kb/draft — body { question }. Returns a draft
// { title, body, category } for the admin's existing KB form to prefill;
// never saves anything itself (see lib/chatbot/kb-draft.ts's header). Gated
// on super_admin/approver, same as every other /admin/chatbot route.
//
// category is classifyTicket(question) — the EXACT same keyword classifier
// support tickets already use (lib/chatbot/classify.ts), reused as-is, not
// a second classifier built for KB docs. It's a pre-fill, not a decision:
// the admin form's category dropdown lets it be overridden before saving,
// same as the support ticket page already treats its own classification as
// "a helper, not an authority."

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { draftKbEntrySchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { draftKbEntry } from '@/lib/chatbot/kb-draft';
import { answerQuestion as matchKeyword, type KbDoc } from '@/lib/chatbot/match';
import { classifyTicket } from '@/lib/chatbot/classify';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can draft KB entries', 403);
  }

  const parsed = await parseBody(request, draftKbEntrySchema);
  if (!parsed.ok) return parsed.response;
  const { question } = parsed.data;

  const service = createServiceClient();

  // Cheap "what does the bot currently say" context — the same synchronous
  // keyword matcher the live bot itself falls back to (lib/chatbot/match.ts),
  // not a second live Gemini call. For a fully-unanswered question this
  // finds nothing (existingWeakAnswer stays null, matching draftKbEntry()'s
  // "no answer at all" framing); for an answered-but-unhelpful question it
  // very likely finds the same doc the RAG path also matched, since
  // FAQ-style keyword overlap and semantic similarity usually agree — good
  // enough context for the model to improve on, without doubling the
  // request's Gemini cost/latency.
  const { data: kbRows } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category')
    .eq('is_active', true);
  const docs: KbDoc[] = (kbRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    keywords: row.keywords ?? [],
    category: row.category,
  }));
  const existingMatch = matchKeyword(question, docs);

  const draft = await draftKbEntry(question, existingMatch?.body ?? null);
  if (!draft) return apiFail('DRAFT_UNAVAILABLE', 'Could not draft a KB entry right now — try again, or write one manually.', 502);

  return apiOk({ ...draft, category: classifyTicket(question) });
}
