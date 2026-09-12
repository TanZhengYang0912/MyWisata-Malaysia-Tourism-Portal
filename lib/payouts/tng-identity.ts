import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInternationalPhone } from '@/lib/phone/international';
import type { PayoutProvider } from '@/lib/payouts/providers';
import { createTngDirectCreditProvider } from '@/lib/payouts/providers/tng-direct-credit';

export type VerifiedTngIdentity = {
  providerReference: string;
  maskedReference: string;
};

export type VerifiedTngIdentityResult =
  | { ok: true; identity: VerifiedTngIdentity }
  | {
      ok: false;
      code: 'PHONE_VERIFICATION_REQUIRED' | 'PAYOUT_PROVIDER_UNSUPPORTED' | 'PAYOUT_DESTINATION_UNAVAILABLE';
      message: string;
      status: 403 | 422 | 503;
    };

export async function resolveVerifiedTngIdentity(
  db: SupabaseClient,
  userId: string,
  provider: PayoutProvider = createTngDirectCreditProvider(),
): Promise<VerifiedTngIdentityResult> {
  const { data, error } = await db
    .from('users')
    .select('phone,phone_verified_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: 'PAYOUT_DESTINATION_UNAVAILABLE',
      message: 'Unable to verify your payout identity',
      status: 503,
    };
  }
  if (!data?.phone || !data.phone_verified_at) {
    return {
      ok: false,
      code: 'PHONE_VERIFICATION_REQUIRED',
      message: 'Verify your account phone before adding a TNG eWallet',
      status: 403,
    };
  }

  const parsedPhone = parseInternationalPhone(data.phone);
  if (!parsedPhone.ok || !/^\+601\d{8,9}$/.test(parsedPhone.e164)) {
    return {
      ok: false,
      code: 'PHONE_VERIFICATION_REQUIRED',
      message: 'Verify a valid Malaysian mobile number before adding a TNG eWallet',
      status: 403,
    };
  }
  if (!provider.isConfigured()) {
    return {
      ok: false,
      code: 'PAYOUT_PROVIDER_UNSUPPORTED',
      message: 'TNG eWallet payouts are not configured yet',
      status: 422,
    };
  }

  try {
    const verification = await provider.verifyDestination({ phoneOrDuitNow: parsedPhone.e164 });
    if (verification.status !== 'verified' || !verification.providerReference) {
      return {
        ok: false,
        code: 'PAYOUT_DESTINATION_UNAVAILABLE',
        message: 'TNG could not verify your account phone',
        status: 503,
      };
    }
    return {
      ok: true,
      identity: {
        providerReference: verification.providerReference,
        maskedReference: verification.maskedReference,
      },
    };
  } catch {
    return {
      ok: false,
      code: 'PAYOUT_DESTINATION_UNAVAILABLE',
      message: 'TNG could not verify your account phone',
      status: 503,
    };
  }
}

export function tngDestinationMatchesIdentity(
  providerReference: string | null | undefined,
  identity: VerifiedTngIdentity,
) {
  return Boolean(providerReference) && providerReference === identity.providerReference;
}
