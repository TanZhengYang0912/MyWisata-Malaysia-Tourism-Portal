import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  clearMaturedCommissions: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ service: true })) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/affiliate/clearing', () => ({ clearMaturedCommissions: mocks.clearMaturedCommissions }));

import { POST } from '../route';

describe('POST /api/admin/affiliate/run-clearing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.clearMaturedCommissions.mockResolvedValue({ cleared: [], reversed: [], skipped: 2, errors: [], hasMore: true });
  });

  it('authorizes the Admin actor while database clearing checks each commission subject', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.isSuperAdmin).toHaveBeenCalledWith(expect.anything(), 'admin-1');
    expect(mocks.clearMaturedCommissions).toHaveBeenCalledWith({ service: true });
    await expect(response.json()).resolves.toMatchObject({ data: { skipped: 2, hasMore: true } });
  });

  it('does not invoke clearing for an unauthorized actor', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.clearMaturedCommissions).not.toHaveBeenCalled();
  });

  it('removes raw row errors and provides safe recovery guidance with Request IDs', async () => {
    mocks.clearMaturedCommissions.mockResolvedValue({
      cleared: [], reversed: [], skipped: 1, hasMore: false,
      errors: [{ attributionId: 'attribution-1', error: 'internal SQL schema and secret leaked', critical: true }],
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('internal SQL schema and secret leaked');
    expect(body.data.errors[0]).toMatchObject({ attributionId: 'attribution-1', code: 'CLEARING_RESULT_UNCERTAIN' });
    expect(body.data.errors[0].requestId).toBeTruthy();
    expect(body.data.errors[0].message).toMatch(/refresh/i);
  });
});
