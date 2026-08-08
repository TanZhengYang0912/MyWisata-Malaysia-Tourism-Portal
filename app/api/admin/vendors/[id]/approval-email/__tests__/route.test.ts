import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const isSuperAdminOrApprover = vi.fn();
const sendCustomVendorEmail = vi.fn();
const recordAudit = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdminOrApprover }));
vi.mock('@/lib/email/sender', () => ({ sendCustomVendorEmail }));
vi.mock('@/lib/audit', () => ({ recordAudit }));

const { POST } = await import('../route');

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';

function request(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/admin/vendors/${VENDOR_ID}/approval-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function callRoute(body: Record<string, unknown>) {
  return POST(request(body), { params: Promise.resolve({ id: VENDOR_ID }) });
}

const VALID_BODY = { email: 'owner@example.com', subject: 'Congratulations!', body: 'Welcome aboard.' };

function mockVendorRow(overrides: Record<string, unknown> = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { id: VENDOR_ID, status: 'approved', approval_email_sent_at: null, ...overrides },
    error: null,
  });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  createServiceClient.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update,
    }),
  });
  return { update };
}

describe('POST /api/admin/vendors/[id]/approval-email', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdminOrApprover.mockReset();
    sendCustomVendorEmail.mockReset();
    recordAudit.mockReset();
    createServiceClient.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    isSuperAdminOrApprover.mockResolvedValue(true);
    sendCustomVendorEmail.mockResolvedValue({ id: 'msg-1' });
    recordAudit.mockResolvedValue(null);
  });

  it('requires an authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await callRoute(VALID_BODY);
    expect(response.status).toBe(401);
  });

  it('requires super_admin or approver', async () => {
    isSuperAdminOrApprover.mockResolvedValue(false);
    const response = await callRoute(VALID_BODY);
    expect(response.status).toBe(403);
  });

  it('422s on an invalid email', async () => {
    const response = await callRoute({ ...VALID_BODY, email: 'not-an-email' });
    expect(response.status).toBe(422);
  });

  it('404s for an unknown vendor', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    createServiceClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
    const response = await callRoute(VALID_BODY);
    expect(response.status).toBe(404);
  });

  it('409s when the vendor is not approved', async () => {
    mockVendorRow({ status: 'pending' });
    const response = await callRoute(VALID_BODY);
    expect(response.status).toBe(409);
    expect(sendCustomVendorEmail).not.toHaveBeenCalled();
  });

  it('409s when an approval email was already sent', async () => {
    mockVendorRow({ approval_email_sent_at: '2026-08-01T00:00:00.000Z' });
    const response = await callRoute(VALID_BODY);
    expect(response.status).toBe(409);
    expect(sendCustomVendorEmail).not.toHaveBeenCalled();
  });

  it('does not write to the database when the email send fails', async () => {
    const { update } = mockVendorRow();
    sendCustomVendorEmail.mockRejectedValue(new Error('SMTP down'));

    const response = await callRoute(VALID_BODY);

    expect(response.status).toBe(502);
    expect(update).not.toHaveBeenCalled();
  });

  it('sends the email, appends the dashboard link, then persists the audit columns', async () => {
    const { update } = mockVendorRow();

    const response = await callRoute(VALID_BODY);

    expect(response.status).toBe(200);
    expect(sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.com',
      subject: 'Congratulations!',
      body: expect.stringContaining('Welcome aboard.'),
    }));
    expect(sendCustomVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('Visit your vendor dashboard:'),
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      approval_email_subject: 'Congratulations!',
      approval_email_body: expect.stringContaining('Visit your vendor dashboard:'),
    }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'vendor.approval_email_sent', entityId: VENDOR_ID }));
  });
});
