import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CUSTOMER_WITHDRAWAL_MINIMUM_RM } from '@/lib/stripe/jit-visibility';
import { deriveCustomerWalletCapabilities } from '@/lib/wallet/customer-capabilities';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [walletResult, profileResult, destinationResult] = await Promise.all([
    db
      .from('wallets')
      .select('topup_sen,earnings_sen,pending_earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('users')
      .select('phone_verified_at,kyc_status,stripe_payouts_enabled')
      .eq('id', user.id)
      .maybeSingle(),
    db
      .from('payout_destinations')
      .select('id,dest_type,provider,label,masked_ref,verification_status,cooldown_until,updated_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (walletResult.error) return NextResponse.json({ error: 'Unable to load wallet balance' }, { status: 500 });
  if (profileResult.error || !profileResult.data) return NextResponse.json({ error: 'Unable to load wallet readiness' }, { status: 500 });
  if (destinationResult.error) return NextResponse.json({ error: 'Unable to load payout destination' }, { status: 500 });

  const wallet = walletResult.data;
  const destination = destinationResult.data;
  const capabilities = deriveCustomerWalletCapabilities({
    phoneVerified: Boolean(profileResult.data.phone_verified_at),
    kycStatus: profileResult.data.kyc_status,
    availableEarningsSen: wallet?.earnings_sen ?? 0,
    minimumWithdrawalSen: CUSTOMER_WITHDRAWAL_MINIMUM_RM * 100,
    stripePayoutsEnabled: Boolean(profileResult.data.stripe_payouts_enabled),
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
