import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  params: Promise<{ submissionId: string; side: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { submissionId, side } = await params;
  if (!UUID.test(submissionId) || (side !== 'front' && side !== 'back')) {
    return apiFail('NOT_FOUND', 'Document not found', 404);
  }

  const service = createServiceClient();
  const { data: storagePath, error } = await service.rpc('get_kyc_document_view', {
    p_submission_id: submissionId,
    p_side: side,
    p_actor_id: user.id,
  });
  if (error) {
    if (error.message.includes('admin_required')) return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (error.message.includes('document_not_found')) return apiFail('NOT_FOUND', 'Document not found', 404);
    return apiFail('DOCUMENT_UNAVAILABLE', 'Document is temporarily unavailable', 500);
  }
  if (typeof storagePath !== 'string') return apiFail('NOT_FOUND', 'Document not found', 404);

  const { data: signed, error: signedError } = await service.storage
    .from('kyc-documents')
    .createSignedUrl(storagePath, 300);
  if (signedError || !signed?.signedUrl) {
    return apiFail('DOCUMENT_UNAVAILABLE', 'Document is temporarily unavailable', 500);
  }

  return apiOk({ signedUrl: signed.signedUrl, expiresIn: 300 });
}
