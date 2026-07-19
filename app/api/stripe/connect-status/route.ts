import { createClient } from '@/lib/supabase/server';
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

  const accountId = row.stripe_connect_account_id as string | null;
  const tier = row.tier as string;
  if (!accountId) {
    return apiOk({
      accountId: null,
      tier,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requiresDashboardAction: false,
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

  const { error: updateError } = await db
    .from('users')
    .update({ stripe_payouts_enabled: status.payoutsEnabled })
    .eq('id', user.id);

  if (updateError) {
    console.error('[stripe-connect-status] payout flag sync failed:', updateError.message);
    return apiFail('STRIPE_STATUS_UNAVAILABLE', 'We could not verify your payout account. Please try again.', 503);
  }

  return apiOk({
    accountId: status.accountId,
    tier,
    payoutsEnabled: status.payoutsEnabled,
    detailsSubmitted: status.detailsSubmitted,
    requiresDashboardAction: status.requiresDashboardAction,
    sync: 'stripe' as const,
  });
}
