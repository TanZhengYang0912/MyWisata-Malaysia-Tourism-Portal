import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { verifyWalletModerationCredential } from '@/lib/wallet/moderation-credential';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const rejectSchema = z.object({
  reasonCategory: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(500),
  moderationCredential: z.string().min(1).max(4096).optional(),
  advisoryAccepted: z.boolean().default(false),
}).strict();

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { user, response } = await requireStaffPermission('admin.withdrawal.approve');
  if (response) return response;

  const parsed = await parseBody(request, rejectSchema);
  if (!parsed.ok) return parsed.response;
  const validated = walletReasonSchema.safeParse({
    action: 'reject',
    reasonCategory: parsed.data.reasonCategory,
    reason: parsed.data.reason,
  });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid rejection reason', 422);
  if (!parsed.data.moderationCredential) {
    return apiFail('MODERATION_REVIEW_REQUIRED', 'Review the rejection reason before continuing.', 422);
  }

  let verification;
  try {
    verification = verifyWalletModerationCredential(parsed.data.moderationCredential, {
      actorId: user.id,
      withdrawalId: id,
      action: 'reject',
      reasonCategory: validated.data.reasonCategory,
      reason: validated.data.reason,
    });
  } catch (credentialError) {
    if (credentialError instanceof Error && credentialError.message === 'wallet_moderation_secret_invalid') {
      return apiFail('MODERATION_REVIEW_UNAVAILABLE', 'Reason review is temporarily unavailable; please try again.', 503);
    }
    throw credentialError;
  }
  if (!verification.valid) {
    return apiFail('MODERATION_REVIEW_REQUIRED', 'The reason review expired or no longer matches. Review it again.', 422);
  }
  if (verification.claims.verdict === 'advisory' && !parsed.data.advisoryAccepted) {
    return apiFail('ADVISORY_ACKNOWLEDGEMENT_REQUIRED', 'Review and acknowledge the Gemini Assistant suggestion before continuing.', 422);
  }

  const { data, error } = await createServiceClient().rpc('reject_wallet_withdrawal_server', {
    p_actor_id: user.id,
    p_id: id,
    p_reason: validated.data.reason,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
  });
  if (error) {
    const message = error.message ?? 'Unable to reject withdrawal';
    const code = message.includes('approver_required') ? 'FORBIDDEN'
      : message.includes('self_dealing') ? 'SELF_DEALING'
        : message.includes('withdrawal_not_rejectable') ? 'INVALID_STATE'
          : 'REJECTION_FAILED';
    return apiFail(code, message, code === 'FORBIDDEN' || code === 'SELF_DEALING' ? 403 : 409);
  }

  const result = data as { user_id: string; amount_rm: number };
  try {
    await enqueueWithdrawalEmail({
      withdrawalId: id,
      userId: result.user_id,
      eventType: 'withdrawal_rejected',
      amountRm: Number(result.amount_rm),
    });
  } catch (emailError) {
    console.error('[withdrawal-reject] email enqueue failed:', emailError);
  }
  return apiOk({ status: 'rejected' });
}
