import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdminOrApprover: vi.fn(),
  serviceRpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ rpc: mocks.serviceRpc })) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdminOrApprover: mocks.isSuperAdminOrApprover }));

import { POST } from '../route';

describe('POST /api/admin/affiliate/run-clearing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdminOrApprover.mockResolvedValue(true);
    mocks.serviceRpc.mockResolvedValue({ data: 2, error: null });
  });

  it('authorizes the Admin actor while database clearing checks each commission subject', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.isSuperAdminOrApprover).toHaveBeenCalledWith(expect.anything(), 'admin-1');
    expect(mocks.serviceRpc).toHaveBeenCalledWith('confirm_pending_earnings');
    await expect(response.json()).resolves.toMatchObject({ data: { confirmed: 2 } });
  });

  it('does not invoke clearing for an unauthorized actor', async () => {
    mocks.isSuperAdminOrApprover.mockResolvedValue(false);

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
});
