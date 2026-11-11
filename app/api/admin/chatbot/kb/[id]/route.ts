// P4 — Member 4: KB editor (CLAUDE-PHASE2.md Feature A)
// PATCH /api/admin/chatbot/kb/[id] — edit or deactivate (isActive: false) a
// doc. Any change to title/body sets updated_at and best-effort re-embeds
// inline, same as the create route. Gated on super_admin, checked
// server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateKbDocumentSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { embedText } from '@/lib/chatbot/embed';
import { reserveAiQuota } from '@/lib/rate-limit/ai';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can edit the knowledge base', 403);
  }

  const parsed = await parseBody(request, updateKbDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const { title, body, keywords, category, isActive } = parsed.data;

  const service = createServiceClient();
  const { data: existing, error: existingError } = await service.from('chatbot_kb_documents')
    .select('id, title, body, keywords, category, is_active')
    .eq('id', id)
    .maybeSingle();
  if (existingError) return apiFail('READ_UNAVAILABLE', 'Unable to load this knowledge-base entry.', 503);
  if (!existing) return apiFail('NOT_FOUND', 'KB document not found', 404);

  const updates: Record<string, unknown> = {};
  if (title !== undefined && title !== existing.title) updates.title = title;
  if (body !== undefined && body !== existing.body) updates.body = body;
  if (keywords !== undefined && JSON.stringify(keywords) !== JSON.stringify(existing.keywords ?? [])) updates.keywords = keywords;
  if (category !== undefined && category !== existing.category) updates.category = category;
  if (isActive !== undefined && isActive !== existing.is_active) updates.is_active = isActive;

  const contentChanged = updates.title !== undefined || updates.body !== undefined;
  const finalTitle = title ?? existing.title;
  const finalBody = body ?? existing.body;
  const willBeActive = isActive ?? existing.is_active;
  if (willBeActive && `${finalTitle}\n${finalBody}`.includes('[ADMIN: confirm')) {
    return apiFail('KB_REVIEW_REQUIRED', 'Confirm the marked policy details before publishing this entry.', 422);
  }
  if (Object.keys(updates).length === 0) return apiOk({ id, changed: false });
  if (contentChanged) updates.updated_at = new Date().toISOString();

  const { error } = await service.from('chatbot_kb_documents').update(updates).eq('id', id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  if (contentChanged && process.env.LLM_API_KEY && await reserveAiQuota(request, 'kb_embedding', user.id)) {
    try {
      const embedding = await embedText(`${title ?? existing.title}\n${body ?? existing.body}`, 'kb');
      await service.from('chatbot_kb_documents').update({ embedding, embedded_at: new Date().toISOString() }).eq('id', id);
    } catch (err) {
      console.error('[chatbot] inline re-embed on update failed', err instanceof Error ? err.message : err);
    }
  }

  return apiOk({ id, changed: true });
}
