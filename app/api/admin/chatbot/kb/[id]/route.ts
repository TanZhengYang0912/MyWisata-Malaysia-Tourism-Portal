// P4 — Member 4: KB editor (CLAUDE-PHASE2.md Feature A)
// PATCH /api/admin/chatbot/kb/[id] — edit or deactivate (isActive: false) a
// doc. Any change to title/body sets updated_at and best-effort re-embeds
// inline, same as the create route. Gated on super_admin/approver, checked
// server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateKbDocumentSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { embedText } from '@/lib/chatbot/embed';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can edit the knowledge base', 403);
  }

  const parsed = await parseBody(request, updateKbDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const { title, body, keywords, category, isActive } = parsed.data;

  const service = createServiceClient();
  const { data: existing } = await service.from('chatbot_kb_documents').select('id, title, body').eq('id', id).maybeSingle();
  if (!existing) return apiFail('NOT_FOUND', 'KB document not found', 404);

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body;
  if (keywords !== undefined) updates.keywords = keywords;
  if (category !== undefined) updates.category = category;
  if (isActive !== undefined) updates.is_active = isActive;

  const contentChanged = title !== undefined || body !== undefined;
  if (contentChanged) updates.updated_at = new Date().toISOString();

  const { error } = await service.from('chatbot_kb_documents').update(updates).eq('id', id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  if (contentChanged && process.env.LLM_API_KEY) {
    try {
      const embedding = await embedText(`${title ?? existing.title}\n${body ?? existing.body}`);
      await service.from('chatbot_kb_documents').update({ embedding, embedded_at: new Date().toISOString() }).eq('id', id);
    } catch (err) {
      console.error('[chatbot] inline re-embed on update failed', err instanceof Error ? err.message : err);
    }
  }

  return apiOk({ id });
}
