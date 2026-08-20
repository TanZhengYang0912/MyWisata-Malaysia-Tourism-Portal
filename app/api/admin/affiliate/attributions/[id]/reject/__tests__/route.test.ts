import { describe, expect, it, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

const createServiceClient = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const isSuperAdminOrApprover = vi.fn();
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdminOrApprover }));

const rejectAttribution = vi.fn();
vi.mock('@/lib/affiliate/clearing', () => ({ rejectAttribution }));

const { POST } = await import('../route');

const ATTRIBUTION_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown = {}) {
  return new Request(`http://localhost/api/admin/affiliate/attributions/${ATTRIBUTION_ID}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(body?: unknown) {
  return POST(request(body), { params: Promise.resolve({ id: ATTRIBUTION_ID }) });
}

describe('POST /api/admin/affiliate/attributions/[id]/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    createClient.mockResolvedValue({ auth: { getUser } });
    createServiceClient.mockReturnValue({});
  });

  it('requires sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await call();
    expect(response.status).toBe(401);
    expect(rejectAttribution).not.toHaveBeenCalled();
  });

  it('rejects a caller who is not super_admin/approver', async () => {
    isSuperAdminOrApprover.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    expect(rejectAttribution).not.toHaveBeenCalled();
  });

  it('rejects a pending attribution with no reason', async () => {
    isSuperAdminOrApprover.mockResolvedValue(true);
    rejectAttribution.mockResolvedValue({ rejected: true });

    const response = await call({});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ id: ATTRIBUTION_ID, status: 'rejected' });
    expect(rejectAttribution).toHaveBeenCalledWith({}, ATTRIBUTION_ID, 'admin-1', undefined);
  });

  it('passes a reason through when provided', async () => {
    isSuperAdminOrApprover.mockResolvedValue(true);
    rejectAttribution.mockResolvedValue({ rejected: true });

    await call({ reason: 'Looks like self-referral via a second account' });

    expect(rejectAttribution).toHaveBeenCalledWith({}, ATTRIBUTION_ID, 'admin-1', 'Looks like self-referral via a second account');
  });

  it('rejects an empty-string reason (schema requires at least 1 char if present)', async () => {
    isSuperAdminOrApprover.mockResolvedValue(true);
    const response = await call({ reason: '' });
    expect(response.status).toBe(422);
    expect(rejectAttribution).not.toHaveBeenCalled();
  });

  it('returns 400 when the attribution is already resolved', async () => {
    isSuperAdminOrApprover.mockResolvedValue(true);
    rejectAttribution.mockResolvedValue({ rejected: false, error: 'Attribution is not pending (already resolved)' });

    const response = await call();
    expect(response.status).toBe(400);
  });
});
