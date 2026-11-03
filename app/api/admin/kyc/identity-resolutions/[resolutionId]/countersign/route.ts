import { z } from 'zod';

import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

type Props = { params: Promise<{ resolutionId: string }> };
const schema = z.object({ version: z.number().int().positive(), secondaryReviewerId: z.string().uuid() }).strict();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: Props) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { resolutionId } = await params;
  if (!UUID.test(resolutionId)) return apiFail('NOT_FOUND', 'Identity resolution not found', 404);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { error } = await db.rpc('authorize_kyc_identity_resolution', {
    p_resolution_id: resolutionId,
    p_expected_version: parsed.data.version,
    p_secondary_actor_id: parsed.data.secondaryReviewerId,
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    if (message.includes('changed') || message.includes('reviewer_invalid')) return apiFail('CONFLICT', 'The selected reviewer or resolution has changed', 409);
    return apiFail('IDENTITY_RESOLUTION_COUNTERSIGN_UNAVAILABLE', 'Second review could not be assigned', 503);
  }
  return apiOk({ authorized: true });
}
