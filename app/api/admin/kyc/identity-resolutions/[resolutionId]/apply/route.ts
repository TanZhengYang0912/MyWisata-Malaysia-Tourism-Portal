import { z } from 'zod';

import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

type Props = { params: Promise<{ resolutionId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({ version: z.number().int().positive(), operationId: z.string().uuid() }).strict();

export async function POST(request: Request, { params }: Props) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { resolutionId } = await params;
  if (!UUID.test(resolutionId)) return apiFail('NOT_FOUND', 'Identity resolution not found', 404);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { error } = await db.rpc('apply_kyc_identity_resolution', {
    p_resolution_id: resolutionId,
    p_expected_version: parsed.data.version,
    p_operation_id: parsed.data.operationId,
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    if (message.includes('not_assigned')) return apiFail('CONFLICT', 'This case must remain assigned to the primary reviewer', 409);
    if (message.includes('confirmation_invalid') || message.includes('evidence_changed') || message.includes('changed')) return apiFail('CONFLICT', 'Evidence or resolution changed; reload and confirm again', 409);
    return apiFail('IDENTITY_RESOLUTION_APPLY_FAILED', 'Identity resolution could not be applied', 409);
  }
  return apiOk({ applied: true });
}
