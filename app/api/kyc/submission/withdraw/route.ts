import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const schema = z.object({
  submissionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  operationId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { error } = await db.rpc('withdraw_kyc_submission', {
    p_submission_id: parsed.data.submissionId,
    p_expected_version: parsed.data.expectedVersion,
    p_operation_id: parsed.data.operationId,
  });
  if (error) {
    const message = error.message ?? '';
    if (message.includes('kyc_withdrawal_conflict')) return apiFail('CONFLICT', 'The review has changed; refresh the KYC status', 409);
    if (message.includes('operation_key_conflict')) return apiFail('CONFLICT', 'This withdrawal request could not be matched; refresh the KYC status', 409);
    if (message.includes('unauthorized')) return apiFail('FORBIDDEN', 'You cannot withdraw this KYC application', 403);
    return apiFail('WITHDRAWAL_UNAVAILABLE', 'KYC application status could not be updated', 503);
  }
  return apiOk({ submissionId: parsed.data.submissionId, status: 'withdrawn', operationId: parsed.data.operationId });
}
