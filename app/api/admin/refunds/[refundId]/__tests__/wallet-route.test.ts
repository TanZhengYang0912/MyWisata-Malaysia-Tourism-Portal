// These business-rule fixtures represent a session that has completed staff verification.
vi.mock("@/lib/auth/staff-assurance", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/staff-assurance")>()), requireStaffAssurance: vi.fn(async () => null) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/staff-assurance', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/staff-assurance')>()), requireStaffAssurance: vi.fn(async () => null) }));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rolesSelect: vi.fn(),
  serviceRpc: vi.fn(),
  refundMaybeSingle: vi.fn(),
  adminGuard: vi.fn(),
}));

vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffRoleManagementSuperAdmin: mocks.adminGuard }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => mocks.rolesSelect() }) }),
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mocks.serviceRpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.refundMaybeSingle }) }),
    }),
  })),
}));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/admin/refunds/refund-id', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
}

describe('POST /api/admin/refunds/:refundId Wallet refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null });
    mocks.adminGuard.mockResolvedValue({ db: {}, user: { id: '11111111-1111-4111-8111-111111111111' }, response: null });
    mocks.rolesSelect.mockResolvedValue({ data: [{ roles: { name: 'super_admin' } }] });
    mocks.refundMaybeSingle.mockResolvedValue({
      data: {
        id: '33333333-3333-4333-8333-333333333333',
        order_id: '44444444-4444-4444-8444-444444444444',
        payment_id: '55555555-5555-4555-8555-555555555555',
        amount: 50,
        status: 'pending',
        payments: { method: 'wallet', provider: 'platform', provider_payment_id: null },
      },
    });
  });

  it('uses the atomic Wallet refund RPC instead of a direct balance write', async () => {
    mocks.serviceRpc.mockResolvedValue({ data: { status: 'processed' }, error: null });

    const response = await POST(request(), { params: Promise.resolve({ refundId: '33333333-3333-4333-8333-333333333333' }) });

    expect(response.status).toBe(200);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('process_wallet_refund', {
      p_refund_id: '33333333-3333-4333-8333-333333333333',
      p_note: null,
      p_actor_id: '11111111-1111-4111-8111-111111111111',
    });
  });
});
