import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  vendorUpdate: vi.fn(),
  vendorUpdateEq: vi.fn(),
  onboardingUpsert: vi.fn(),
  roleUpsert: vi.fn(),
  auditAndNotify: vi.fn(),
  emitVendorNotification: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/audit', () => ({ auditAndNotify: mocks.auditAndNotify }));
vi.mock('@/lib/vendor-notifications/emit', () => ({
  emitVendorNotification: mocks.emitVendorNotification,
}));

import { POST } from '../route';

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';
const RECOMMENDATION_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSION_ID = '33333333-3333-4333-8333-333333333333';

function request(action = 'approve') {
  return new Request(`http://localhost/api/admin/vendors/${VENDOR_ID}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

const context = { params: Promise.resolve({ id: VENDOR_ID }) };

describe('POST /api/admin/vendors/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mocks.vendorUpdateEq.mockResolvedValue({ error: null });
    mocks.vendorUpdate.mockReturnValue({ eq: mocks.vendorUpdateEq });
    mocks.onboardingUpsert.mockResolvedValue({ error: null });
    mocks.roleUpsert.mockResolvedValue({ error: null });
    mocks.auditAndNotify.mockResolvedValue(undefined);
    mocks.emitVendorNotification.mockResolvedValue(undefined);
    mocks.createServiceClient.mockReturnValue({ from: vi.fn() });
    mocks.rpc.mockResolvedValue({
      data: {
        vendor_id: VENDOR_ID,
        status: 'approved',
        converted: true,
        recommendation_id: RECOMMENDATION_ID,
        conversion_id: CONVERSION_ID,
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({
              data: [{ roles: { name: 'super_admin' } }],
              error: null,
            }),
          }),
          upsert: mocks.roleUpsert,
        };
      }
      if (table === 'vendors') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: VENDOR_ID,
                  owner_id: 'owner-1',
                  name: 'Rasa Malaysia Kitchen',
                  status: 'pending',
                },
                error: null,
              }),
            }),
          }),
          update: mocks.vendorUpdate,
        };
      }
      if (table === 'vendor_onboarding_profiles') {
        return { upsert: mocks.onboardingUpsert };
      }
      if (table === 'roles') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({ data: { id: 4 }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('uses one atomic RPC instead of separate approve writes', async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_approve_claimed_vendor', {
      p_vendor_id: VENDOR_ID,
    });
    expect(mocks.vendorUpdate).not.toHaveBeenCalled();
    expect(mocks.onboardingUpsert).not.toHaveBeenCalled();
    expect(mocks.roleUpsert).not.toHaveBeenCalled();
  });

  it('does not audit or notify when atomic approval fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'admin_required' } });

    const response = await POST(request(), context);

    expect(response.status).toBe(403);
    expect(mocks.auditAndNotify).not.toHaveBeenCalled();
    expect(mocks.emitVendorNotification).not.toHaveBeenCalled();
  });

  it('returns and audits claimed recommendation conversion identifiers', async () => {
    const response = await POST(request(), context);

    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: VENDOR_ID,
        status: 'approved',
        converted: true,
        recommendationId: RECOMMENDATION_ID,
        conversionId: CONVERSION_ID,
      },
    });
    expect(mocks.auditAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        afterData: expect.objectContaining({
          status: 'approved',
          recommendationId: RECOMMENDATION_ID,
          conversionId: CONVERSION_ID,
        }),
      }),
      expect.any(Array),
    );
  });

  it('allows an admin role to reach the claimed-vendor approval RPC', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ data: [{ roles: { name: 'admin' } }], error: null }),
          }),
        };
      }
      if (table === 'vendors') {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: VENDOR_ID, owner_id: 'owner-1', name: 'Rasa Malaysia Kitchen', status: 'pending' },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_approve_claimed_vendor', {
      p_vendor_id: VENDOR_ID,
    });
  });
});
