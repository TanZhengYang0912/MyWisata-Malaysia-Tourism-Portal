import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';

const idPattern = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ draftId: string; side: string }> }) {
  const { draftId, side } = await params;
  if (!idPattern.test(draftId) || !['front', 'back'].includes(side)) return apiFail('NOT_FOUND', 'Draft image not found', 404);
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: path, error } = await service.rpc('get_kyc_draft_document', {
    p_owner_user_id: user.id, p_draft_id: draftId, p_side: side,
  });
  if (error || typeof path !== 'string' || !path.startsWith(`${user.id}/drafts/${draftId}/`)) {
    return apiFail('NOT_FOUND', 'Draft image not found', 404);
  }
  const { data: file, error: downloadError } = await service.storage.from('kyc-documents').download(path);
  if (downloadError || !file) return apiFail('DRAFT_IMAGE_UNAVAILABLE', 'Saved draft image is unavailable', 503);
  return new Response(file, { headers: {
    'Content-Type': ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  } });
}
