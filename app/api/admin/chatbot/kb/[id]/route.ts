import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateKbDocumentSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(auth, user.id))) return apiFail('FORBIDDEN', 'Only Super Admin can edit the knowledge base', 403);

  const parsed = await parseBody(request, updateKbDocumentSchema);
  if (!parsed.ok) return parsed.response;
  const service = createServiceClient();
  if ('isActive' in parsed.data) {
    if (parsed.data.isActive) return apiFail('KB_REVIEW_REQUIRED', 'Review and publish a saved draft before activating this entry.', 422);
    const { data: updated, error } = await service.from('chatbot_kb_documents')
      .update({ is_active: false }).eq('id', id).eq('is_active', true).select('id').maybeSingle();
    if (error) return apiFail('WRITE_UNAVAILABLE', 'Unable to deactivate this entry.', 503);
    return apiOk({ id, changed: Boolean(updated) });
  }

  const { data, error } = await service.rpc('save_chatbot_kb_revision', {
    p_document_id: id,
    p_author_id: user.id,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_keywords: parsed.data.keywords,
    p_category: parsed.data.category,
    p_source_refs: parsed.data.sourceRefs,
    p_expected_content_version: parsed.data.expectedContentVersion,
    p_operation_id: null,
  });
  if (error) {
    if (error.message === 'chatbot_kb_revision_conflict') return apiFail('CONFLICT', 'This entry changed. Reload the draft before saving again.', 409);
    if (error.message === 'chatbot_kb_document_not_found') return apiFail('NOT_FOUND', 'Knowledge-base entry not found.', 404);
    return apiFail('WRITE_UNAVAILABLE', 'Unable to save this knowledge-base draft.', 503);
  }
  return apiOk(data);
}
