// P4 — Member 4: KB editor (CLAUDE-PHASE2.md Feature A)
// GET  /api/admin/chatbot/kb — every doc (active + inactive), for the admin table
// POST /api/admin/chatbot/kb — create a doc, then best-effort embed it inline
// Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { createKbDocumentSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view the knowledge base', 403);
  }

  const rawPage = new URL(request.url).searchParams.get('page') ?? '1';
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 1_000_000) {
    return apiFail('INVALID_INPUT', 'Page must be a positive integer.', 400);
  }
  const pageSize = 10;
  let page = Number(rawPage);
  const service = createServiceClient();
  const fetchPage = () => service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category, is_active, embedded_at, updated_at, created_at', { count: 'exact' })
    .order('is_active', { ascending: false })
    .order('title', { ascending: true })
    .order('created_at', { ascending: false });
  const initialResult = await fetchPage().range((page - 1) * pageSize, page * pageSize - 1);
  let { data, error } = initialResult;
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to load the knowledge-base entries.', 503);
  const total = initialResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) {
    page = totalPages;
    ({ data, error } = await fetchPage().range((page - 1) * pageSize, page * pageSize - 1));
    if (error) return apiFail('READ_UNAVAILABLE', 'Unable to load the knowledge-base entries.', 503);
  }

  const response = apiOk({
    documents: (data ?? []).map((d) => ({
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
    page,
    pageSize,
    total,
    totalPages,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can edit the knowledge base', 403);
  }

  const parsed = await parseBody(request, createKbDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const { title, body, keywords, category, isActive } = parsed.data;
  if ((isActive ?? true) && `${title}\n${body}`.includes('[ADMIN: confirm')) {
    return apiFail('KB_REVIEW_REQUIRED', 'Confirm the marked policy details before publishing this entry.', 422);
  }

  const service = createServiceClient();
  const { data: created, error } = await service
    .from('chatbot_kb_documents')
    .insert({ title, body, keywords, category: category ?? null, is_active: isActive ?? true, content_version: 1, embedding_version: null })
    .select('id,content_version')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ id: created.id });
}
