import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  serviceFrom: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  serviceRpc: vi.fn(),
  verifyDestination: vi.fn(),
  capabilities: vi.fn(),
  resolveTngIdentity: vi.fn(),
  tngMatches: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc, from: mocks.serviceFrom })) }));
vi.mock('@/lib/payouts/providers/tng-direct-credit', () => ({
  createTngDirectCreditProvider: vi.fn(() => ({ verifyDestination: mocks.verifyDestination })),
}));
vi.mock('@/lib/payouts/destinations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/payouts/destinations')>();
  return { ...original, getPayoutDestinationCapabilities: mocks.capabilities };
});
vi.mock('@/lib/payouts/tng-identity', () => ({
  resolveVerifiedTngIdentity: mocks.resolveTngIdentity,
  tngDestinationMatchesIdentity: mocks.tngMatches,
}));

import { GET, POST } from '../route';

describe('GET /api/wallet/destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.serviceFrom.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockImplementationOnce(() => ({ order: mocks.order }));
    mocks.order.mockResolvedValue({ data: [{ id: 'dest-1', dest_type: 'bank', provider: 'stripe_connect', label: 'Bank ****1234', masked_ref: '****1234', verification_status: 'verified', is_default: true }], error: null });
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: false, provider: 'tng_direct_credit' } });
    mocks.resolveTngIdentity.mockResolvedValue({ ok: false, code: 'PAYOUT_PROVIDER_UNSUPPORTED', message: 'unsupported', status: 422 });
    mocks.tngMatches.mockReturnValue(false);
  });

  it('returns masked destinations and disables unsupported E-wallets', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { destinations: [{ id: 'dest-1', type: 'bank_account', status: 'verified' }], capabilities: { e_wallet: { enabled: false } } } });
  });

  it('persists a provider-verified TNG destination through the service-only RPC', async () => {
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });
    mocks.resolveTngIdentity.mockResolvedValue({
      ok: true,
      identity: { providerReference: 'tng_dest_opaque', maskedReference: '+60••••6789' },
    });
    mocks.serviceRpc.mockResolvedValue({
      data: {
        id: 'dest-tng', dest_type: 'ewallet', provider: 'tng_direct_credit', label: 'TNG eWallet',
        masked_ref: '+60••••6789', verification_status: 'verified', is_default: false, cooldown_until: null,
      },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/wallet/destinations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'e_wallet' }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('save_verified_payout_destination', {
      p_user_id: 'user-1',
      p_dest_type: 'ewallet',
      p_provider: 'tng_direct_credit',
      p_provider_reference: 'tng_dest_opaque',
      p_label: 'TNG eWallet',
      p_masked_ref: '+60••••6789',
      p_is_default: false,
    });
    expect(mocks.serviceFrom).not.toHaveBeenCalledWith('payout_destinations');
  });

  it('rejects browser-supplied TNG identity and label fields before resolving the verified phone', async () => {
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });

    const response = await POST(new Request('http://localhost/api/wallet/destinations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'e_wallet', label: '+60123456789' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(mocks.resolveTngIdentity).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it('disables historical TNG destinations that do not match the current verified phone', async () => {
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });
    mocks.resolveTngIdentity.mockResolvedValue({
      ok: true,
      identity: { providerReference: 'tng_dest_current', maskedReference: '+60••••3951' },
    });
    mocks.tngMatches.mockImplementation((reference: string) => reference === 'tng_dest_current');
    mocks.order.mockReset();
    mocks.order.mockImplementationOnce(() => ({ order: mocks.order }));
    mocks.order.mockResolvedValue({
      data: [
        { id: 'current', dest_type: 'ewallet', provider: 'tng_direct_credit', label: '+60177143951', masked_ref: '+60••••3951', provider_reference: 'tng_dest_current', verification_status: 'verified', is_default: true },
        { id: 'old', dest_type: 'ewallet', provider: 'tng_direct_credit', label: '+60120000000', masked_ref: '+60••••0000', provider_reference: 'tng_dest_old', verification_status: 'verified', is_default: false },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      destinations: [
        { id: 'current', status: 'verified', displayLabel: 'TNG eWallet +60••••3951' },
        { id: 'old', status: 'disabled', displayLabel: 'TNG eWallet +60••••0000' },
      ],
      tngIdentity: { maskedPhone: '+60••••3951' },
    });
    expect(JSON.stringify(body)).not.toContain('tng_dest_current');
    expect(JSON.stringify(body)).not.toContain('tng_dest_old');
    expect(JSON.stringify(body)).not.toContain('+60177143951');
    expect(JSON.stringify(body)).not.toContain('+60120000000');
    expect(mocks.serviceFrom).toHaveBeenCalledWith('payout_destinations');
  });
});
