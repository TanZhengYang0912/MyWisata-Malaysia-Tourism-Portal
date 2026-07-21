import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  dbFrom: vi.fn(),
  rolesSelect: vi.fn(),
  rolesEq: vi.fn(),
  serviceFrom: vi.fn(),
  enqueueInviteEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.dbFrom })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })) }));
vi.mock('@/lib/email/events', () => ({ enqueueVendorClaimInviteEmail: mocks.enqueueInviteEmail }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/admin/vendors/recommendation-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendationId: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com' }),
  });
}

describe('POST /api/admin/vendors/recommendation-invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    mocks.dbFrom.mockReturnValue({ select: mocks.rolesSelect });
    mocks.rolesSelect.mockReturnValue({ eq: mocks.rolesEq });
    mocks.rolesEq.mockResolvedValue({ data: [{ roles: { name: 'super_admin' } }], error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'vendor_recommendations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'rec-1', vendor_name: 'Rasa Malaysia Kitchen', status: 'approved' }, error: null }) }) }),
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === 'vendor_recommendation_invites') {
        return { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: 'invite-1', expires_at: '2026-10-20T00:00:00.000Z' }, error: null }) }) }) };
      }
      return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });
    mocks.enqueueInviteEmail.mockResolvedValue(undefined);
  });

  it('marks the recommendation invited and enqueues the one-time claim email', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.enqueueInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
      recommendationId: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      vendorName: 'Rasa Malaysia Kitchen',
    }));
  });
});
