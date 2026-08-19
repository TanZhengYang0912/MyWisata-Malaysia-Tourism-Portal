import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPayoutDestinationCapabilities, normalizeTngDestinationIdentifier, type PayoutDestinationStatus, type PayoutDestinationType } from '@/lib/payouts/destinations';
import { createTngDirectCreditProvider } from '@/lib/payouts/providers/tng-direct-credit';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';

function mapDestination(row: {
  id: string;
  dest_type: 'bank' | 'ewallet';
  provider: string | null;
  label: string | null;
  masked_ref: string | null;
  verification_status: string | null;
  is_default: boolean | null;
  cooldown_until: string | null;
}) {
  const type: PayoutDestinationType = row.dest_type === 'ewallet' ? 'e_wallet' : 'bank_account';
  const status: PayoutDestinationStatus = row.verification_status === 'verified'
    || row.verification_status === 'pending'
    || row.verification_status === 'disabled'
    || row.verification_status === 'failed'
    ? row.verification_status
    : 'pending';

  return {
    id: row.id,
    type,
    provider: row.provider ?? 'legacy',
    displayLabel: row.label ?? row.masked_ref ?? (type === 'bank_account' ? 'Bank account' : 'E-wallet'),
    status,
    isDefault: Boolean(row.is_default),
    cooldownUntil: row.cooldown_until,
  };
}

const destinationSchema = z.object({
  type: z.enum(['bank_account', 'e_wallet']),
  phoneOrDuitNow: z.string().trim().min(6).max(32).optional(),
  label: z.string().trim().min(1).max(100).optional(),
}).strict();

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await db
    .from('payout_destinations')
    .select('id,dest_type,provider,label,masked_ref,verification_status,is_default,cooldown_until')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[wallet-destinations] lookup failed:', error.message);
    return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to load payout destinations', 503);
  }

  return apiOk({ destinations: (data ?? []).map(mapDestination), capabilities: getPayoutDestinationCapabilities() });
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, destinationSchema);
  if (!parsed.ok) return parsed.response;
  const { type, phoneOrDuitNow, label } = parsed.data;

  if (type === 'e_wallet') {
    const capabilities = getPayoutDestinationCapabilities();
    if (!capabilities.e_wallet.enabled) return apiFail('PAYOUT_PROVIDER_UNSUPPORTED', 'TNG eWallet payouts are not configured yet', 422);
    if (!phoneOrDuitNow) return apiFail('INVALID_PAYOUT_DESTINATION', 'Enter a TNG phone number or DuitNow account number', 422);

    const normalized = normalizeTngDestinationIdentifier(phoneOrDuitNow);
    if (!normalized.ok) return apiFail('INVALID_PAYOUT_DESTINATION', normalized.message, 422);

    const provider = createTngDirectCreditProvider();
    const verification = await provider.verifyDestination({ phoneOrDuitNow: normalized.value });
    if (verification.status !== 'verified' || !verification.providerReference) {
      return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', verification.reason ?? 'TNG could not verify this destination', 422);
    }

    const { data, error } = await createServiceClient().rpc('save_verified_payout_destination', {
      p_user_id: user.id,
      p_dest_type: 'ewallet',
      p_provider: 'tng_direct_credit',
      p_provider_reference: verification.providerReference,
      p_label: label ?? 'TNG eWallet',
      p_masked_ref: verification.maskedReference,
      p_is_default: false,
    });
    if (error || !data) return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'We could not save this payout destination. Your details were not added; please try again.', 503);
    return apiOk({ destination: mapDestination(data) }, { status: 201 });
  }

  const { data: profile, error: profileError } = await db
    .from('users')
    .select('stripe_connect_account_id,stripe_payouts_enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to verify bank payout account', 503);
  if (!profile?.stripe_connect_account_id || !profile.stripe_payouts_enabled) {
    return apiFail('PAYOUT_ACCOUNT_REQUIRED', 'Complete Stripe bank payout setup before adding this destination', 403);
  }

  const { data, error } = await createServiceClient().rpc('save_verified_payout_destination', {
    p_user_id: user.id,
    p_dest_type: 'bank',
    p_provider: 'stripe_connect',
    p_provider_reference: profile.stripe_connect_account_id,
    p_label: label ?? 'Stripe Connect bank account',
    p_masked_ref: 'Bank account on file',
    p_is_default: true,
  });
  if (error || !data) return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'We could not save this payout destination. Your details were not added; please try again.', 503);
  return apiOk({ destination: mapDestination(data) }, { status: 201 });
}
