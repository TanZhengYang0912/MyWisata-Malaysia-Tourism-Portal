import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const draftVendorInviteEmail = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/recommendations/invite-draft', () => ({ draftVendorInviteEmail }));

const { POST } = await import('../route');

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/vendors/recommendation-invite/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const RECOMMENDATION_ID = '11111111-1111-4111-8111-111111111111';

function mockRecommendationRow(overrides: Record<string, unknown> = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: RECOMMENDATION_ID,
      vendor_name: 'Rasa Malaysia Kitchen',
      description: 'A cozy local eatery.',
      vendor_address: '123 Jalan Example',
      status: 'approved',
      categories: [{ name: 'Food & Dining' }],
      ...overrides,
    },
    error: null,
  });
  createServiceClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  });
}

describe('POST /api/admin/vendors/recommendation-invite/draft', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    draftVendorInviteEmail.mockReset();
    createServiceClient.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));
    expect(response.status).toBe(401);
  });

  it('requires the vendor management permission', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));
    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('has_staff_permission', {
      p_user_id: 'admin-1',
      p_permission_key: 'admin.vendor.manage',
    });
  });

  it('404s for an unknown recommendation', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    createServiceClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));
    expect(response.status).toBe(404);
  });

  it('409s when the recommendation is not approved/invited', async () => {
    mockRecommendationRow({ status: 'pending' });
    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));
    expect(response.status).toBe(409);
  });

  it('502s when the draft function returns null', async () => {
    mockRecommendationRow();
    draftVendorInviteEmail.mockResolvedValue(null);
    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));
    expect(response.status).toBe(502);
  });

  it('drafts using the recommendation\'s real details and returns subject/body', async () => {
    mockRecommendationRow();
    draftVendorInviteEmail.mockResolvedValue({ subject: 'Join MyWisata', body: 'We would love to have you.' });

    const response = await POST(request({ recommendationId: RECOMMENDATION_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { subject: 'Join MyWisata', body: 'We would love to have you.' },
    });
    expect(draftVendorInviteEmail).toHaveBeenCalledWith({
      vendorName: 'Rasa Malaysia Kitchen',
      description: 'A cozy local eatery.',
      vendorAddress: '123 Jalan Example',
      category: 'Food & Dining',
    });
  });
});
