import { createClient } from '@/lib/supabase/server';
import { getPayoutDestinationCapabilities, type PayoutDestinationStatus, type PayoutDestinationType } from '@/lib/payouts/destinations';
import { apiFail, apiOk } from '@/lib/validation/schemas';

function mapDestination(row: {
  id: string;
  dest_type: 'bank' | 'ewallet';
  provider: string | null;
  label: string | null;
  masked_ref: string | null;
  verification_status: string | null;
  is_default: boolean | null;
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
  };
}

export async function GET() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await db
    .from('payout_destinations')
    .select('id,dest_type,provider,label,masked_ref,verification_status,is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[wallet-destinations] lookup failed:', error.message);
    return apiFail('PAYOUT_DESTINATION_UNAVAILABLE', 'Unable to load payout destinations', 503);
  }

  return apiOk({ destinations: (data ?? []).map(mapDestination), capabilities: getPayoutDestinationCapabilities() });
}
