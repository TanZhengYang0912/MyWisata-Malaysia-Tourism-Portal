import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { moderateAccountText } from '@/lib/moderation';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const holdSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, holdSchema);
  if (!parsed.ok) return parsed.response;
  const moderation = await moderateAccountText(parsed.data.reason, 'withdrawal_hold_reason');
  if ('error' in moderation) return apiFail('MODERATION_UNAVAILABLE', 'Content review is temporarily unavailable; please try again', 503);
  if (moderation.flagged) return apiFail('CONTENT_REJECTED', 'The hold reason contains disallowed content', 422);

  const { data, error } = await db.rpc('hold_wallet_withdrawal', {
    p_id: id,
    p_reason: parsed.data.reason,
    p_ip: requestIp(request),
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
