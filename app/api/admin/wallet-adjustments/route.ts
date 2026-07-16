import { z } from 'zod';
import { moderateAccountText } from '@/lib/moderation';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const adjustmentSchema = z.object({
  userId: z.string().uuid(),
  bucket: z.enum(['topup', 'earnings']),
  direction: z.enum(['credit', 'debit']),
  amountSen: z.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, adjustmentSchema);
  if (!parsed.ok) return parsed.response;

  const moderation = await moderateAccountText(parsed.data.reason, 'wallet_adjustment_reason');
  if ('error' in moderation) {
    return apiFail('MODERATION_UNAVAILABLE', 'Content review is temporarily unavailable; please try again', 503);
  }
  if (moderation.flagged) {
    return apiFail('CONTENT_REJECTED', 'The adjustment reason contains disallowed content', 422);
  }

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
  return apiOk(data);
}
