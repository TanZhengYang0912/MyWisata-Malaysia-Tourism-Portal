import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { CUSTOMER_WITHDRAWAL_MINIMUM_RM } from '@/lib/stripe/jit-visibility';
import { deriveCustomerWalletCapabilities } from '@/lib/wallet/customer-capabilities';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const destinationIdParam = new URL(request.url).searchParams.get('destinationId');
  const parsedDestinationId = destinationIdParam === null
    ? { success: true as const, data: null }
    : z.string().uuid().safeParse(destinationIdParam);
  if (!parsedDestinationId.success) {
    return NextResponse.json({ error: 'Invalid payout destination' }, { status: 422 });
  }
  const destinationId = parsedDestinationId.data;
  const destinationPromise = destinationId === null
    ? Promise.resolve({ data: null, error: null })
    : db
      .from('payout_destinations')
      .select('id,dest_type,provider,label,masked_ref,verification_status,cooldown_until,updated_at')
      .eq('user_id', user.id)
      .eq('id', destinationId)
      .maybeSingle();

  const [walletResult, profileResult, destinationResult] = await Promise.all([
    db
      .from('wallets')
      .select('topup_sen,earnings_sen,pending_earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('users')
      .select('kyc_status,stripe_payouts_enabled')
      .eq('id', user.id)
      .maybeSingle(),
    destinationPromise,
  ]);
  if (walletResult.error) return NextResponse.json({ error: 'Unable to load wallet balance' }, { status: 500 });
  if (profileResult.error || !profileResult.data) return NextResponse.json({ error: 'Unable to load wallet readiness' }, { status: 500 });
  if (destinationResult.error) return NextResponse.json({ error: 'Unable to load payout destination' }, { status: 500 });
  if (destinationId !== null && !destinationResult.data) {
    return NextResponse.json({ error: 'Payout destination not found' }, { status: 404 });
  }

  const wallet = walletResult.data;
  const destination = destinationResult.data;
  const capabilities = deriveCustomerWalletCapabilities({
    kycStatus: profileResult.data.kyc_status,
    availableEarningsSen: wallet?.earnings_sen ?? 0,
    minimumWithdrawalSen: CUSTOMER_WITHDRAWAL_MINIMUM_RM * 100,
    stripePayoutsEnabled: Boolean(profileResult.data.stripe_payouts_enabled),
    stripeFallback: destinationId === null,
    destination: destination ? {
      id: destination.id,
      type: destination.dest_type === 'ewallet' ? 'e_wallet' : 'bank_account',
      provider: destination.provider ?? 'legacy',
      displayLabel: destination.label ?? destination.masked_ref ?? 'Payout destination',
      status: destination.verification_status === 'verified'
        || destination.verification_status === 'disabled'
        || destination.verification_status === 'failed'
        ? destination.verification_status
        : 'pending',
      cooldownUntil: destination.cooldown_until,
      updatedAt: destination.updated_at,
    } : null,
  });

  return NextResponse.json({
    data: {
      topupSen: wallet?.topup_sen ?? 0,
      earningsSen: wallet?.earnings_sen ?? 0,
      pendingEarningsSen: wallet?.pending_earnings_sen ?? 0,
      reservedEarningsSen: wallet?.reserved_earnings_sen ?? 0,
      withdrawnEarningsSen: wallet?.withdrawn_earnings_sen ?? 0,
      ...capabilities,
    },
    error: null,
  });
}
