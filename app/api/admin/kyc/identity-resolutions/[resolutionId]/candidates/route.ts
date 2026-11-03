import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail } from '@/lib/validation/schemas';

type Props = { params: Promise<{ resolutionId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Props) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { resolutionId } = await params;
  const version = Number(new URL(request.url).searchParams.get('version'));
  if (!UUID.test(resolutionId) || !Number.isSafeInteger(version) || version < 1) return apiFail('VALIDATION_FAILED', 'A valid resolution version is required', 422);
  const { data, error } = await db.rpc('list_kyc_identity_resolver_candidates', {
    p_resolution_id: resolutionId,
    p_expected_version: version,
  });
  if (error) {
    if (error.message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    return apiFail('IDENTITY_RESOLUTION_REVIEWERS_UNAVAILABLE', 'Eligible reviewers could not be loaded', 503);
  }
  const candidates = Array.isArray(data) ? data.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as { user_id?: unknown; display_name?: unknown };
    return typeof value.user_id === 'string' && typeof value.display_name === 'string'
      ? [{ id: value.user_id, name: value.display_name }] : [];
  }) : [];
  return Response.json({ data: { candidates } }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
