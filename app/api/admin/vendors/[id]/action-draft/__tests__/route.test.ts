import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const draftVendorActionReason = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/vendors/action-draft', () => ({ draftVendorActionReason }));

const { POST } = await import('../route');

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';

function request(action = 'reject') {
  return new Request(`http://localhost/api/admin/vendors/${VENDOR_ID}/action-draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

function callRoute(action?: string) {
  return POST(request(action), { params: Promise.resolve({ id: VENDOR_ID }) });
}

function mockVendorRow(overrides: Record<string, unknown> = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: VENDOR_ID,
      name: 'Rasa Malaysia Kitchen',
      description: 'A cozy local eatery.',
      business_type: 'restaurant',
      users: { full_name: 'Ah Meng' },
      vendor_onboarding_profiles: { contact_name: 'Ah Meng' },
      ...overrides,
    },
    error: null,
  });
  createServiceClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  });
}

describe('POST /api/admin/vendors/[id]/action-draft', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    draftVendorActionReason.mockReset();
    createServiceClient.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await callRoute();
    expect(response.status).toBe(401);
  });

  it('requires the vendor management permission', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await callRoute();
    expect(response.status).toBe(403);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects an unknown action', async () => {
    const response = await callRoute('suspend_forever');
    expect(response.status).toBe(422);
  });

  it('404s for an unknown vendor', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    createServiceClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
    const response = await callRoute();
    expect(response.status).toBe(404);
  });

  it('502s when the draft function returns null', async () => {
    mockVendorRow();
    draftVendorActionReason.mockResolvedValue(null);
    const response = await callRoute();
    expect(response.status).toBe(502);
  });

  it('drafts using the vendor\'s real details and the requested action', async () => {
    mockVendorRow();
    draftVendorActionReason.mockResolvedValue('Please provide your business registration document.');

    const response = await callRoute('suspend');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { reason: 'Please provide your business registration document.' },
    });
    expect(draftVendorActionReason).toHaveBeenCalledWith('suspend', {
      vendorName: 'Rasa Malaysia Kitchen',
      businessType: 'restaurant',
      description: 'A cozy local eatery.',
      contactName: 'Ah Meng',
    });
  });
});
