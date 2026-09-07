import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const holdSchema = z.object({ reasonCategory: z.string().trim().min(1), reason: z.string().trim().min(10).max(500) }).strict();

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user, response } = await requireStaffPermission('admin.withdrawal.approve');
  if (response) return response;

  const parsed = await parseBody(request, holdSchema);
  if (!parsed.ok) return parsed.response;
  const validated = walletReasonSchema.safeParse({ action: 'hold', ...parsed.data });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid hold reason', 422);
  const moderation = await moderateWalletAction({ actorId: user.id, withdrawalId: id, action: 'hold', reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);

  const { data, error } = await db.rpc('hold_wallet_withdrawal', {
    p_id: id,
    p_reason: parsed.data.reason,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
  });
  if (error) {
    const message = error.message ?? 'Unable to hold withdrawal';
    return apiFail(message.includes('approver_required') ? 'FORBIDDEN' : 'HOLD_FAILED', message, message.includes('approver_required') ? 403 : 409);
  }

  const result = data as { user_id: string; amount_rm: number };
  try {
    await enqueueWithdrawalEmail({ withdrawalId: id, userId: result.user_id, eventType: 'withdrawal_hold', amountRm: Number(result.amount_rm) });
  } catch (emailError) {
    console.error('[withdrawal-hold] email enqueue failed:', emailError);
  }
  return apiOk({ status: 'hold' });
}
