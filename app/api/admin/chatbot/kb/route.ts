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
    .select('id, title, body, keywords, category, is_active, embedded_at, updated_at, created_at, content_version, published_source_refs', { count: 'exact' })
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

  const documentIds = (data ?? []).map((document) => document.id);
  const { data: revisions, error: revisionError } = documentIds.length
    ? await service.from('chatbot_kb_revisions')
      .select('id, document_id, title, body, keywords, category, source_refs, base_content_version')
      .in('document_id', documentIds)
      .eq('state', 'draft')
    : { data: [], error: null };
  if (revisionError) return apiFail('READ_UNAVAILABLE', 'Unable to load pending knowledge-base reviews.', 503);
  const revisionByDocument = new Map((revisions ?? []).map((revision) => [revision.document_id, revision]));

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
      contentVersion: d.content_version,
      sourceRefs: d.published_source_refs ?? [],
      pendingRevision: revisionByDocument.get(d.id) ? {
        id: revisionByDocument.get(d.id)!.id,
        title: revisionByDocument.get(d.id)!.title,
        body: revisionByDocument.get(d.id)!.body,
        keywords: revisionByDocument.get(d.id)!.keywords ?? [],
        category: revisionByDocument.get(d.id)!.category,
        sourceRefs: revisionByDocument.get(d.id)!.source_refs ?? [],
        baseContentVersion: revisionByDocument.get(d.id)!.base_content_version,
      } : null,
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
  const { title, body, keywords, category, sourceRefs, operationId } = parsed.data;
  const service = createServiceClient();
  const { data, error } = await service.rpc('save_chatbot_kb_revision', {
    p_document_id: null,
    p_author_id: user.id,
    p_title: title,
    p_body: body,
    p_keywords: keywords,
    p_category: category ?? null,
    p_source_refs: sourceRefs,
    p_expected_content_version: 0,
    p_operation_id: operationId,
  });
  if (error) return apiFail('WRITE_UNAVAILABLE', 'Unable to save this knowledge-base draft.', 503);
  return apiOk(data);
}
