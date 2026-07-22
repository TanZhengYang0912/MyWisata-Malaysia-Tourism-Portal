import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));

import { GET } from '../route';

describe('GET /api/wallet/destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockImplementationOnce(() => ({ order: mocks.order }));
    mocks.order.mockResolvedValue({ data: [{ id: 'dest-1', dest_type: 'bank', provider: 'stripe_connect', label: 'Bank ****1234', masked_ref: '****1234', verification_status: 'verified', is_default: true }], error: null });
  });

  it('returns masked destinations and disables unsupported E-wallets', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { destinations: [{ id: 'dest-1', type: 'bank_account', status: 'verified' }], capabilities: { e_wallet: { enabled: false } } } });
  });
});
