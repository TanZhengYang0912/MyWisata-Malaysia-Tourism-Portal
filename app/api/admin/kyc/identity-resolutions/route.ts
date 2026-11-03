import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { requireKycReviewer } from '@/lib/kyc/reviewer-auth';
import { apiFail, parseBody } from '@/lib/validation/schemas';

export async function GET(request: Request) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const submissionId = new URL(request.url).searchParams.get('submissionId');
  if (!submissionId || !z.string().uuid().safeParse(submissionId).success) return apiFail('VALIDATION_FAILED', 'A valid KYC case is required', 422);
  const { data, error } = await db.rpc('get_my_kyc_identity_resolution_for_case', { p_submission_id: submissionId });
  if (error) {
    if (error.message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    return apiFail('IDENTITY_RESOLUTION_UNAVAILABLE', 'Identity resolution could not be checked', 503);
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

const schema = z.object({
  submissionId: z.string().uuid(),
  kind: z.enum(['replacement', 'legacy_conflict', 'ownership_correction']),
  reasonCode: z.enum(['legacy_resolution', 'identity_replacement']),
  supportTicketRef: z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
  operationId: z.string().uuid().optional(),
}).strict();

export async function POST(request: Request) {
  const { db, user, response } = await requireKycReviewer();
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await db.rpc('create_kyc_identity_resolution', {
    p_submission_id: parsed.data.submissionId,
    p_kind: parsed.data.kind,
    p_reason_code: parsed.data.reasonCode,
    p_support_ticket_ref: parsed.data.supportTicketRef?.trim() || null,
    p_operation_id: parsed.data.operationId ?? randomUUID(),
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('permission_required')) return apiFail('FORBIDDEN', 'Identity resolution permission required', 403);
    if (message.includes('not_assigned')) return apiFail('CONFLICT', 'This case must be assigned to you before resolution', 409);
    if (message.includes('state_conflict') || message.includes('case_changed') || message.includes('resolution_exists')) return apiFail('CONFLICT', 'This case or identity already has an active resolution', 409);
    if (message.includes('self_dealing')) return apiFail('FORBIDDEN', 'You cannot resolve your own identity case', 403);
    return apiFail('IDENTITY_RESOLUTION_UNAVAILABLE', 'Identity resolution could not be started', 503);
  }
  if (!data || typeof data !== 'object' || typeof data.id !== 'string' || typeof data.version !== 'number') {
    return apiFail('IDENTITY_RESOLUTION_UNAVAILABLE', 'Identity resolution could not be started', 503);
  }
  const result = Response.json({ data: { id: data.id, status: data.status, version: data.version } }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
  return result;
}
