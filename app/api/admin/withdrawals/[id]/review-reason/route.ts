import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { signWalletModerationCredential } from '@/lib/wallet/moderation-credential';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const reviewSchema = z.object({
  reasonCategory: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(500),
}).strict();

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { user, response } = await requireStaffPermission('admin.withdrawal.approve');
  if (response) return response;

  const parsed = await parseBody(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const validated = walletReasonSchema.safeParse({ action: 'reject', ...parsed.data });
  if (!validated.success) {
    return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid rejection reason', 422);
  }

  const moderation = await moderateWalletAction({
    actorId: user.id,
    withdrawalId: id,
    action: 'reject',
    reasonCategory: validated.data.reasonCategory,
    reason: validated.data.reason,
  });
  if (!moderation.ok) {
    const status = moderation.code === 'MODERATION_UNAVAILABLE' ? 503
      : moderation.code === 'RATE_LIMITED' ? 429
        : 422;
    return apiFail(moderation.code, moderation.message, status);
  }

  const verdict = moderation.advisory ? 'advisory' : 'clear';
  try {
    const moderationCredential = signWalletModerationCredential({
      actorId: user.id,
      withdrawalId: id,
      action: 'reject',
      reasonCategory: validated.data.reasonCategory,
      reason: validated.data.reason,
      verdict,
    });
    return apiOk({ verdict, advisory: moderation.advisory, moderationCredential });
  } catch (error) {
    if (error instanceof Error && error.message === 'wallet_moderation_secret_invalid') {
      return apiFail('MODERATION_REVIEW_UNAVAILABLE', 'Reason review is temporarily unavailable; please try again.', 503);
    }
    throw error;
  }
}
