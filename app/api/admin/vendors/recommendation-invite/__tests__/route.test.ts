import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  dbFrom: vi.fn(),
  rolesSelect: vi.fn(),
  rolesEq: vi.fn(),
  serviceFrom: vi.fn(),
  enqueueInviteEmail: vi.fn(),
  sendCustomVendorEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.dbFrom })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })) }));
vi.mock('@/lib/email/events', () => ({ enqueueVendorClaimInviteEmail: mocks.enqueueInviteEmail }));
vi.mock('@/lib/email/sender', () => ({ sendCustomVendorEmail: mocks.sendCustomVendorEmail }));

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
    mocks.sendCustomVendorEmail.mockResolvedValue({ id: 'msg-1' });
  });

  it('marks the recommendation invited and enqueues the one-time claim email', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.enqueueInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
      recommendationId: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      vendorName: 'Rasa Malaysia Kitchen',
    }));
    expect(mocks.sendCustomVendorEmail).not.toHaveBeenCalled();
  });

  describe('custom subject/body (AI-drafted, admin-edited invite)', () => {
    function customRequest(overrides: Record<string, unknown> = {}) {
      return new Request('http://localhost/api/admin/vendors/recommendation-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recommendationId: '11111111-1111-4111-8111-111111111111',
          email: 'owner@example.com',
          subject: 'Join MyWisata',
          body: 'We would love to have you on the platform.',
          ...overrides,
        }),
      });
    }

    it('sends via sendCustomVendorEmail and skips the legacy template path', async () => {
      const response = await POST(customRequest());

      expect(response.status).toBe(201);
      expect(mocks.sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'owner@example.com',
        subject: 'Join MyWisata',
        body: expect.stringContaining('We would love to have you on the platform.'),
      }));
      expect(mocks.sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.stringContaining('Complete your vendor sign-up here:'),
      }));
      expect(mocks.enqueueInviteEmail).not.toHaveBeenCalled();
    });

    it('rejects subject without body', async () => {
      const response = await POST(customRequest({ body: undefined }));
      expect(response.status).toBe(422);
    });

    it('rejects subject/body without an email', async () => {
      const response = await POST(customRequest({ email: undefined }));
      expect(response.status).toBe(422);
    });
  });
});
