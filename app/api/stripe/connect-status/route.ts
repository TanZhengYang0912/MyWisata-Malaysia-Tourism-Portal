import { createClient } from '@/lib/supabase/server';
import { isRealStripeAccountId } from '@/lib/stripe/account-id';
import { retrieveConnectAccountStatus } from '@/lib/stripe/connect-status';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: row, error: userError } = await db
    .from('users')
    .select('tier, stripe_connect_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (userError) {
    console.error('[stripe-connect-status] user lookup failed:', userError.message);
    return apiFail('USER_LOOKUP_FAILED', 'Unable to load your payout account status', 404);
  }
  if (!row) return apiFail('USER_NOT_FOUND', 'User profile not found', 404);

  const storedAccountId = row.stripe_connect_account_id as string | null;
  const accountId = isRealStripeAccountId(storedAccountId) ? storedAccountId : null;
  const tier = row.tier as string;
  if (!accountId) {
    return apiOk({
      accountId: null,
      tier,
      payoutsEnabled: false,
      detailsSubmitted: false,
      payoutStatus: 'unlinked' as const,
      sync: 'database' as const,
    });
  }

  let status;
  try {
    status = await retrieveConnectAccountStatus(accountId);
  } catch (error) {
    const details = error as { message?: string; requestId?: string };
    console.error('[stripe-connect-status] Stripe retrieve failed:', {
      message: details.message ?? 'unknown',
      requestId: details.requestId ?? null,
    });
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  const { error: updateError } = await db.rpc('update_connect_status', {
    p_connect_account_id: status.accountId,
    p_payouts_enabled: status.payoutsEnabled,
  });

  if (updateError) {
    console.error('[stripe-connect-status] payout flag sync failed:', updateError.message);
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  return apiOk({
    accountId: status.accountId,
    tier,
    payoutsEnabled: status.payoutsEnabled,
    detailsSubmitted: status.detailsSubmitted,
    payoutStatus: status.payoutStatus,
    sync: 'stripe' as const,
  });
}
