import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPayoutDestinationCapabilities, type PayoutDestinationStatus, type PayoutDestinationType } from '@/lib/payouts/destinations';
import { resolveVerifiedTngIdentity, tngDestinationMatchesIdentity, type VerifiedTngIdentity } from '@/lib/payouts/tng-identity';
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
  provider_reference?: string | null;
}, statusOverride?: PayoutDestinationStatus) {
  const type: PayoutDestinationType = row.dest_type === 'ewallet' ? 'e_wallet' : 'bank_account';
  const status: PayoutDestinationStatus = statusOverride ?? (row.verification_status === 'verified'
    || row.verification_status === 'pending'
    || row.verification_status === 'disabled'
    || row.verification_status === 'failed'
    ? row.verification_status
    : 'pending');

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

const destinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('e_wallet'), label: z.string().trim().min(1).max(100).optional() }).strict(),
  z.object({ type: z.literal('bank_account'), label: z.string().trim().min(1).max(100).optional() }).strict(),
]);

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await db
    .from('payout_destinations')
    .select('id,dest_type,provider,label,masked_ref,provider_reference,verification_status,is_default,cooldown_until')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[wallet-destinations] lookup failed:', error.message);
    return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to load payout destinations', 503);
  }

  const capabilities = getPayoutDestinationCapabilities();
  let tngIdentity: VerifiedTngIdentity | null = null;
  if (capabilities.e_wallet.enabled) {
    const resolved = await resolveVerifiedTngIdentity(db, user.id);
    if (resolved.ok) tngIdentity = resolved.identity;
  }
  const destinations = (data ?? []).map((row) => {
    const isTng = row.dest_type === 'ewallet' && row.provider === 'tng_direct_credit';
    const unavailable = isTng && (!tngIdentity || !tngDestinationMatchesIdentity(row.provider_reference, tngIdentity));
    return mapDestination(row, unavailable ? 'disabled' : undefined);
  });

  return apiOk({
    destinations,
    capabilities,
    tngIdentity: tngIdentity ? { maskedPhone: tngIdentity.maskedReference } : null,
  });
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, destinationSchema);
  if (!parsed.ok) return parsed.response;
  const { type, label } = parsed.data;

  if (type === 'e_wallet') {
    const capabilities = getPayoutDestinationCapabilities();
    if (!capabilities.e_wallet.enabled) return apiFail('PAYOUT_PROVIDER_UNSUPPORTED', 'TNG eWallet payouts are not configured yet', 422);
    const identity = await resolveVerifiedTngIdentity(db, user.id);
    if (!identity.ok) return apiFail(identity.code, identity.message, identity.status);

    const { data, error } = await createServiceClient().rpc('save_verified_payout_destination', {
      p_user_id: user.id,
      p_dest_type: 'ewallet',
      p_provider: 'tng_direct_credit',
      p_provider_reference: identity.identity.providerReference,
      p_label: label ?? 'TNG eWallet',
      p_masked_ref: identity.identity.maskedReference,
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
