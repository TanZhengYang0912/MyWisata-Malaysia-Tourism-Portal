import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  serviceRpc: vi.fn(),
  verifyDestination: vi.fn(),
  capabilities: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc })) }));
vi.mock('@/lib/payouts/providers/tng-direct-credit', () => ({
  createTngDirectCreditProvider: vi.fn(() => ({ verifyDestination: mocks.verifyDestination })),
}));
vi.mock('@/lib/payouts/destinations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/payouts/destinations')>();
  return { ...original, getPayoutDestinationCapabilities: mocks.capabilities };
});

import { GET, POST } from '../route';

describe('GET /api/wallet/destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockImplementationOnce(() => ({ order: mocks.order }));
    mocks.order.mockResolvedValue({ data: [{ id: 'dest-1', dest_type: 'bank', provider: 'stripe_connect', label: 'Bank ****1234', masked_ref: '****1234', verification_status: 'verified', is_default: true }], error: null });
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: false, provider: 'tng_direct_credit' } });
  });

  it('returns masked destinations and disables unsupported E-wallets', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { destinations: [{ id: 'dest-1', type: 'bank_account', status: 'verified' }], capabilities: { e_wallet: { enabled: false } } } });
  });

  it('persists a provider-verified TNG destination through the service-only RPC', async () => {
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });
    mocks.verifyDestination.mockResolvedValue({
      status: 'verified',
      providerReference: 'tng_dest_opaque',
      maskedReference: '••••6789',
      reason: null,
    });
    mocks.serviceRpc.mockResolvedValue({
      data: {
        id: 'dest-tng', dest_type: 'ewallet', provider: 'tng_direct_credit', label: 'TNG eWallet',
        masked_ref: '••••6789', verification_status: 'verified', is_default: false, cooldown_until: null,
      },
      error: null,
    });

    const response = await POST(new Request('http://localhost/api/wallet/destinations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'e_wallet', phoneOrDuitNow: '0123456789', label: 'TNG eWallet' }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('save_verified_payout_destination', {
      p_user_id: 'user-1',
      p_dest_type: 'ewallet',
      p_provider: 'tng_direct_credit',
      p_provider_reference: 'tng_dest_opaque',
      p_label: 'TNG eWallet',
      p_masked_ref: '••••6789',
      p_is_default: false,
    });
    expect(mocks.from).not.toHaveBeenCalledWith('payout_destinations');
  });

  it('rejects an invalid TNG identifier before calling the provider', async () => {
    mocks.capabilities.mockReturnValue({ bank_account: { enabled: true, provider: 'stripe_connect' }, e_wallet: { enabled: true, provider: 'tng_direct_credit' } });

    const response = await POST(new Request('http://localhost/api/wallet/destinations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'e_wallet', phoneOrDuitNow: 'abcdef', label: 'TNG eWallet' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({
      code: 'INVALID_PAYOUT_DESTINATION',
      message: 'Enter a Malaysian mobile number or a valid DuitNow ID (6–32 letters/numbers with at least 4 digits).',
    });
    expect(mocks.verifyDestination).not.toHaveBeenCalled();
  });
});
