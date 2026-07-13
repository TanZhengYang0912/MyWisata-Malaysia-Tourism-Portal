// P4 — Member 4: KB editor (CLAUDE-PHASE2.md Feature A)
// GET  /api/admin/chatbot/kb — every doc (active + inactive), for the admin table
// POST /api/admin/chatbot/kb — create a doc, then best-effort embed it inline
// Gated on super_admin/approver, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { createKbDocumentSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { embedText } from '@/lib/chatbot/embed';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view the knowledge base', 403);
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category, is_active, embedded_at, updated_at, created_at')
    .order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk(
    (data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      body: d.body,
      keywords: d.keywords ?? [],
      category: d.category,
      isActive: d.is_active,
      hasEmbedding: Boolean(d.embedded_at),
      embeddedAt: d.embedded_at,
      updatedAt: d.updated_at,
      createdAt: d.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can edit the knowledge base', 403);
  }

  const parsed = await parseBody(request, createKbDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const { title, body, keywords, category, isActive } = parsed.data;

  const service = createServiceClient();
  const { data: created, error } = await service
    .from('chatbot_kb_documents')
    .insert({ title, body, keywords, category: category ?? null, is_active: isActive ?? true })
    .select('id')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  // "auto re-embed on save" (CLAUDE-PHASE2.md Feature A) — best-effort. If
  // LLM_API_KEY is missing or the call fails, the doc is still fully usable
  // via the keyword fallback; POST /api/admin/chatbot/reindex catches it
  // later once a key is available.
  if (process.env.LLM_API_KEY) {
    try {
      const embedding = await embedText(`${title}\n${body}`);
      await service.from('chatbot_kb_documents').update({ embedding, embedded_at: new Date().toISOString() }).eq('id', created.id);
    } catch (err) {
      console.error('[chatbot] inline embed on create failed', err instanceof Error ? err.message : err);
    }
  }

  return apiOk({ id: created.id });
}
