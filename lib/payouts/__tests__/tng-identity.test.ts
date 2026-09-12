import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayoutProvider } from '@/lib/payouts/providers';
import {
  resolveVerifiedTngIdentity,
  tngDestinationMatchesIdentity,
} from '@/lib/payouts/tng-identity';

const userId = '11111111-1111-4111-8111-111111111111';

function dbWith(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle };
}

function providerWith(overrides: Partial<PayoutProvider> = {}): PayoutProvider {
  return {
    name: 'tng_direct_credit',
    destinationType: 'e_wallet',
    isConfigured: vi.fn(() => true),
    verifyDestination: vi.fn(async () => ({
      status: 'verified',
      providerReference: 'tng_dest_verified_phone',
      maskedReference: '+60••••3951',
      reason: null,
    })),
    createPayout: vi.fn(),
    ...overrides,
  } as PayoutProvider;
}

describe('verified TNG identity', () => {
  it('fails closed when the current account has no OTP-verified phone', async () => {
    const provider = providerWith();

    await expect(resolveVerifiedTngIdentity(dbWith({ phone: null, phone_verified_at: null }).db, userId, provider))
      .resolves.toMatchObject({ ok: false, code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
    await expect(resolveVerifiedTngIdentity(dbWith({ phone: '+60177143951', phone_verified_at: null }).db, userId, provider))
      .resolves.toMatchObject({ ok: false, code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
    expect(provider.verifyDestination).not.toHaveBeenCalled();
  });

  it('requires the verified profile value to be a Malaysian mobile phone', async () => {
    const provider = providerWith();

    await expect(resolveVerifiedTngIdentity(dbWith({ phone: '+12025550142', phone_verified_at: '2026-09-12T00:00:00Z' }).db, userId, provider))
      .resolves.toMatchObject({ ok: false, code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
    expect(provider.verifyDestination).not.toHaveBeenCalled();
  });

  it('derives only opaque and masked references from the authenticated verified phone', async () => {
    const provider = providerWith();
    const result = await resolveVerifiedTngIdentity(
      dbWith({ phone: '+60 17-714 3951', phone_verified_at: '2026-09-12T00:00:00Z' }).db,
      userId,
      provider,
    );

    expect(result).toEqual({
      ok: true,
      identity: {
        providerReference: 'tng_dest_verified_phone',
        maskedReference: '+60••••3951',
        verifiedPhone: '+60177143951',
        profilePhone: '+60 17-714 3951',
      },
    });
    expect(provider.verifyDestination).toHaveBeenCalledWith({ phoneOrDuitNow: '+60177143951' });
  });

  it('maps database, provider configuration, and verification failures safely', async () => {
    await expect(resolveVerifiedTngIdentity(dbWith(null, { message: 'db failed' }).db, userId, providerWith()))
      .resolves.toMatchObject({ ok: false, code: 'PAYOUT_DESTINATION_UNAVAILABLE', status: 503 });
    await expect(resolveVerifiedTngIdentity(
      dbWith({ phone: '+60177143951', phone_verified_at: '2026-09-12T00:00:00Z' }).db,
      userId,
      providerWith({ isConfigured: vi.fn(() => false) }),
    )).resolves.toMatchObject({ ok: false, code: 'PAYOUT_PROVIDER_UNSUPPORTED', status: 422 });
    await expect(resolveVerifiedTngIdentity(
      dbWith({ phone: '+60177143951', phone_verified_at: '2026-09-12T00:00:00Z' }).db,
      userId,
      providerWith({ verifyDestination: vi.fn(async () => ({ status: 'rejected' as const, providerReference: null, maskedReference: '+60••••3951', reason: 'rejected' })) }),
    )).resolves.toMatchObject({ ok: false, code: 'PAYOUT_DESTINATION_UNAVAILABLE', status: 503 });
    await expect(resolveVerifiedTngIdentity(
      dbWith({ phone: '+60177143951', phone_verified_at: '2026-09-12T00:00:00Z' }).db,
      userId,
      providerWith({ verifyDestination: vi.fn(async () => { throw new Error('provider offline'); }) }),
    )).resolves.toMatchObject({ ok: false, code: 'PAYOUT_DESTINATION_UNAVAILABLE', status: 503 });
  });

  it('matches destinations only by the server-side opaque provider reference', () => {
    const identity = { providerReference: 'tng_dest_verified_phone', maskedReference: '+60••••3951', verifiedPhone: '+60177143951', profilePhone: '+60177143951' };
    expect(tngDestinationMatchesIdentity('tng_dest_verified_phone', identity)).toBe(true);
    expect(tngDestinationMatchesIdentity('tng_dest_other_phone', identity)).toBe(false);
    expect(tngDestinationMatchesIdentity(null, identity)).toBe(false);
  });
});
