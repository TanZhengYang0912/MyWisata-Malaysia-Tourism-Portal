import { beforeEach, describe, expect, it, vi } from 'vitest';

// These fixtures represent an already verified staff session; this suite focuses
// on approval-email drafting behavior.
vi.mock('@/lib/auth/staff-assurance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/staff-assurance')>()),
  requireStaffAssurance: vi.fn(async () => null),
}));

const getUser = vi.fn();
const rpc = vi.fn();
const draftVendorApprovalEmail = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/vendors/approval-draft', () => ({ draftVendorApprovalEmail }));

const { POST } = await import('../route');

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request(`http://localhost/api/admin/vendors/${VENDOR_ID}/approval-email/draft`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function callRoute() {
  return POST(request(), { params: Promise.resolve({ id: VENDOR_ID }) });
}

function mockVendorRow(overrides: Record<string, unknown> = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: VENDOR_ID,
      name: 'Rasa Malaysia Kitchen',
      status: 'approved',
      description: 'A cozy local eatery.',
      business_type: 'restaurant',
      users: { full_name: 'Ah Meng', email: 'owner@example.com' },
      vendor_onboarding_profiles: { contact_name: 'Ah Meng', contact_email: 'contact@example.com', business_address: '123 Jalan Example' },
      ...overrides,
    },
    error: null,
  });
  createServiceClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  });
}

describe('POST /api/admin/vendors/[id]/approval-email/draft', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    draftVendorApprovalEmail.mockReset();
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

  it('404s for an unknown vendor', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    createServiceClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
    const response = await callRoute();
    expect(response.status).toBe(404);
  });

  it('409s when the vendor is not approved', async () => {
    mockVendorRow({ status: 'pending' });
    const response = await callRoute();
    expect(response.status).toBe(409);
  });

  it('502s when the draft function returns null', async () => {
    mockVendorRow();
    draftVendorApprovalEmail.mockResolvedValue(null);
    const response = await callRoute();
    expect(response.status).toBe(502);
  });

  it('explains when vendor details were withheld from AI', async () => {
    mockVendorRow();
    draftVendorApprovalEmail.mockResolvedValue({ error: 'sensitive_data_detected' });
    const response = await callRoute();
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PERSONAL_DATA_WITHHELD', message: expect.stringContaining('write the email manually') },
    });
  });

  it('drafts using the vendor\'s real details and returns subject/body', async () => {
    mockVendorRow();
    draftVendorApprovalEmail.mockResolvedValue({ subject: 'Congratulations!', body: 'Welcome aboard.' });

    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { subject: 'Congratulations!', body: 'Welcome aboard.' },
    });
    expect(draftVendorApprovalEmail).toHaveBeenCalledWith({
      locale: 'en',
      vendorName: 'Rasa Malaysia Kitchen',
      businessType: 'restaurant',
      description: 'A cozy local eatery.',
      contactName: 'Ah Meng',
      address: '123 Jalan Example',
    });
  });
});
