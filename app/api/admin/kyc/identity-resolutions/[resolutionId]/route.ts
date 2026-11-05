import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail } from '@/lib/validation/schemas';

type Props = { params: Promise<{ resolutionId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Props) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { resolutionId } = await params;
  if (!UUID.test(resolutionId)) return apiFail('NOT_FOUND', 'Identity resolution not found', 404);
  const { data, error } = await db.rpc('get_kyc_identity_resolution', { p_resolution_id: resolutionId });
  if (error) {
    if (error.message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    return apiFail('NOT_FOUND', 'Identity resolution not found', 404);
  }
  if (!data || typeof data !== 'object') return Response.json({ data: null }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  const value = data as Record<string, unknown>;
  const safe = {
    id: typeof value.id === 'string' ? value.id : null,
    kind: typeof value.kind === 'string' ? value.kind : null,
    status: typeof value.status === 'string' ? value.status : null,
    version: typeof value.version === 'number' ? value.version : null,
    caseId: typeof value.caseId === 'string' ? value.caseId : null,
    primary: value.primary === true,
    secondary: value.secondary === true,
    primaryConfirmed: value.primaryConfirmed === true,
    secondaryConfirmed: value.secondaryConfirmed === true,
    canApply: value.canApply === true,
  };
  return Response.json({ data: safe }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
