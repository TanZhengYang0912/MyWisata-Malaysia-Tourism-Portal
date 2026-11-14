import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

const publishSchema = z.object({
  revisionId: z.string().uuid(),
  expectedContentVersion: z.number().int().nonnegative(),
  confirmed: z.literal(true),
}).strict();

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(auth, user.id))) return apiFail('FORBIDDEN', 'Only Super Admin can publish knowledge-base entries', 403);

  const parsed = await parseBody(request, publishSchema);
  if (!parsed.ok) return parsed.response;
  const service = createServiceClient();
  const { data: result, error } = await service.rpc('publish_chatbot_kb_revision', {
    p_document_id: id,
    p_revision_id: parsed.data.revisionId,
    p_reviewer_id: user.id,
    p_expected_content_version: parsed.data.expectedContentVersion,
    p_confirmed: parsed.data.confirmed,
  });
  if (error) {
    if (error.message === 'chatbot_kb_revision_conflict') return apiFail('CONFLICT', 'This draft is out of date. Reload it and review the latest version.', 409);
    if (error.message === 'chatbot_kb_revision_not_found' || error.message === 'chatbot_kb_document_not_found') return apiFail('NOT_FOUND', 'This draft is no longer available. Reload the knowledge base.', 404);
    if (error.message === 'chatbot_kb_source_required') return apiFail('KB_SOURCE_REQUIRED', 'Add at least one source reference before publishing.', 422);
    if (error.message === 'chatbot_kb_review_required') return apiFail('KB_REVIEW_REQUIRED', 'Review the marked details and confirm before publishing.', 422);
    return apiFail('WRITE_UNAVAILABLE', 'Unable to publish this entry. The current version remains available.', 503);
  }
  return apiOk(result);
}
