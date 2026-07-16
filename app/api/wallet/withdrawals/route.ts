import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { toSen } from '@/lib/wallet/amounts';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const submitSchema = z.object({
  amountRm: z.string().trim().min(1).max(20),
}).strict();

function withdrawalError(message: string) {
  if (message.includes('kyc_required')) {
    return apiFail('KYC_REQUIRED', 'KYC approval is required before requesting a withdrawal', 403);
  }
  if (message.includes('payout_account_required')) {
    return apiFail('PAYOUT_ACCOUNT_REQUIRED', 'Complete Stripe payout account setup before requesting a withdrawal', 403);
  }
  if (message.includes('below_min_withdrawal')) {
    return apiFail('MINIMUM_NOT_MET', 'The withdrawal amount is below the current minimum', 422);
  }
  if (message.includes('active_withdrawal_exists')) {
    return apiFail('ACTIVE_WITHDRAWAL_EXISTS', 'You already have a withdrawal under review or in progress', 409);
  }
  if (message.includes('insufficient_earnings')) {
    return apiFail('INSUFFICIENT_EARNINGS', 'Your available earnings are not sufficient for this withdrawal', 409);
  }
  return apiFail('WITHDRAWAL_FAILED', 'Unable to submit the withdrawal request', 409);
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, submitSchema);
  if (!parsed.ok) return parsed.response;
  const amountSen = toSen(parsed.data.amountRm);
  if (amountSen === null) {
    return apiFail('INVALID_AMOUNT', 'Enter a positive MYR amount with no more than two decimal places', 422);
  }

  const { data, error } = await db.rpc('submit_wallet_withdrawal', { p_amount_sen: amountSen });
  if (error) return withdrawalError(error.message ?? 'withdrawal_failed');
  const result = data as { request_id: string };
  try {
    await enqueueWithdrawalEmail({
      withdrawalId: result.request_id,
      userId: user.id,
      eventType: 'withdrawal_submitted',
      amountRm: amountSen / 100,
    });
  } catch (emailError) {
    console.error('[wallet-withdrawal] email enqueue failed:', emailError);
  }
  return apiOk(result, { status: 201 });
}
