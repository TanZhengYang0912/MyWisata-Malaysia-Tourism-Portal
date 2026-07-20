import { z } from 'zod';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { enqueueUserTransactionEmail } from '@/lib/email/events';

const adjustmentSchema = z.object({
  userId: z.string().uuid(),
  bucket: z.enum(['topup', 'earnings']),
  direction: z.enum(['credit', 'debit']),
  amountSen: z.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(10).max(500),
  reasonCategory: z.string().trim().min(1).default('other'),
}).strict();

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, adjustmentSchema);
  if (!parsed.ok) return parsed.response;

  const validated = walletReasonSchema.safeParse({ action: 'adjustment', reason: parsed.data.reason, reasonCategory: parsed.data.reasonCategory });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid adjustment reason', 422);
  const moderation = await moderateWalletAction({ actorId: user.id, action: 'adjustment', reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);

  const { data, error } = await db.rpc('apply_wallet_adjustment', {
    p_user_id: parsed.data.userId,
    p_bucket: parsed.data.bucket,
    p_direction: parsed.data.direction,
    p_amount_sen: parsed.data.amountSen,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const message = error.message ?? 'Unable to apply Wallet adjustment';
    const code = message.includes('super_admin_required')
      ? 'FORBIDDEN'
      : message.includes('insufficient_wallet_balance')
        ? 'INSUFFICIENT_BALANCE'
        : 'ADJUSTMENT_FAILED';
    return apiFail(code, message, code === 'FORBIDDEN' ? 403 : 409);
  }
  try {
    await enqueueUserTransactionEmail({
      userId: parsed.data.userId,
      eventType: 'wallet_adjustment',
      eventKey: `wallet_adjustment:${String((data as { transaction_id?: string }).transaction_id ?? parsed.data.userId)}`,
      reference: String((data as { transaction_id?: string }).transaction_id ?? 'wallet-adjustment'),
      amountRm: parsed.data.amountSen / 100,
    });
  } catch (emailError) {
    console.error('[wallet-adjustment] email enqueue failed:', emailError);
  }
  return apiOk(data);
}
