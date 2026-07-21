import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { toSen } from '@/lib/wallet/amounts';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { retrieveConnectAccountStatus } from '@/lib/stripe/connect-status';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const submitSchema = z.object({
  amountRm: z.string().trim().min(1).max(20),
  destinationId: z.string().uuid().optional(),
}).strict();

function withdrawalError(message: string) {
  if (message.includes('phone_verification_required')) {
    return apiFail('PHONE_VERIFICATION_REQUIRED', 'Phone verification is required before requesting a withdrawal', 403);
  }
  if (message.includes('kyc_required')) {
    return apiFail('KYC_REQUIRED', 'KYC approval is required before requesting a withdrawal', 403);
  }
  if (message.includes('payout_account_required')) {
    return apiFail('PAYOUT_ACCOUNT_REQUIRED', 'Complete Stripe payout account setup before requesting a withdrawal', 403);
  }
  if (message.includes('payout_destination_required')) {
    return apiFail('PAYOUT_DESTINATION_REQUIRED', 'Select a verified payout destination before requesting a withdrawal', 403);
  }
  if (message.includes('payout_provider_unsupported')) {
    return apiFail('PAYOUT_PROVIDER_UNSUPPORTED', 'This payout provider is not enabled yet', 422);
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

  const { data: userRow, error: userLookupError } = await db
    .from('users')
    .select('stripe_connect_account_id,phone_verified_at,kyc_status')
    .eq('id', user.id)
    .maybeSingle();

  if (userLookupError) {
    console.error('[wallet-withdrawal] payout account lookup failed:', userLookupError.message);
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  const accountId = userRow?.stripe_connect_account_id as string | null | undefined;
  if (!userRow?.phone_verified_at) {
    return apiFail('PHONE_VERIFICATION_REQUIRED', 'Phone verification is required before requesting a withdrawal', 403);
  }
  if (userRow.kyc_status !== 'approved') {
    return apiFail('KYC_REQUIRED', 'KYC approval is required before requesting a withdrawal', 403);
  }
  if (!accountId) {
    return apiFail('PAYOUT_ACCOUNT_REQUIRED', 'Complete Stripe payout account setup before requesting a withdrawal', 403);
  }

  let connectStatus;
  try {
    connectStatus = await retrieveConnectAccountStatus(accountId);
  } catch (error) {
    const details = error as { message?: string; requestId?: string };
    console.error('[wallet-withdrawal] Stripe status retrieve failed:', {
      message: details.message ?? 'unknown',
      requestId: details.requestId ?? null,
    });
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  const { error: syncError } = await db.rpc('update_connect_status', {
    p_connect_account_id: connectStatus.accountId,
    p_payouts_enabled: connectStatus.payoutsEnabled,
  });

  if (syncError) {
    console.error('[wallet-withdrawal] payout status sync failed:', syncError.message);
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  if (!connectStatus.payoutsEnabled) {
    return apiFail('PAYOUT_ACCOUNT_REQUIRED', 'Complete Stripe payout account setup before requesting a withdrawal', 403);
  }

  let destinationId = parsed.data.destinationId ?? null;
  if (destinationId) {
    const { data: destination, error: destinationError } = await db
      .from('payout_destinations')
      .select('id,dest_type,provider,verification_status')
      .eq('id', destinationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (destinationError) return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to verify payout destination', 503);
    if (!destination || destination.verification_status !== 'verified') return apiFail('PAYOUT_DESTINATION_REQUIRED', 'Select a verified payout destination before requesting a withdrawal', 403);
    if (destination.dest_type === 'ewallet' || destination.provider !== 'stripe_connect') return apiFail('PAYOUT_PROVIDER_UNSUPPORTED', 'This payout provider is not enabled yet', 422);
  } else {
    const { data: destination, error: destinationError } = await db
      .from('payout_destinations')
      .upsert({
        user_id: user.id,
        dest_type: 'bank',
        label: 'Stripe Connect bank account',
        masked_ref: 'Bank account on file',
        is_default: true,
        provider: 'stripe_connect',
        provider_reference: accountId,
        verification_status: 'verified',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider,provider_reference' })
      .select('id')
      .single();
    if (destinationError || !destination) return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to verify payout destination', 503);
    destinationId = destination.id;
  }

  const { data, error } = await db.rpc('submit_wallet_withdrawal', { p_amount_sen: amountSen, p_destination_id: destinationId });
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
