import { describe, expect, it, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

const createServiceClient = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const isSuperAdmin = vi.fn();
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));

const acceptAttribution = vi.fn();
vi.mock('@/lib/affiliate/clearing', () => ({ acceptAttribution }));

const { POST } = await import('../route');

const ATTRIBUTION_ID = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request(`http://localhost/api/admin/affiliate/attributions/${ATTRIBUTION_ID}/accept`, { method: 'POST' });
}

function call() {
  return POST(request(), { params: Promise.resolve({ id: ATTRIBUTION_ID }) });
}

describe('POST /api/admin/affiliate/attributions/[id]/accept', () => {
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
    expect(acceptAttribution).not.toHaveBeenCalled();
  });

  it('rejects a caller who is not super_admin', async () => {
    isSuperAdmin.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    expect(acceptAttribution).not.toHaveBeenCalled();
  });

  it('accepts a pending attribution and returns the outcome', async () => {
    isSuperAdmin.mockResolvedValue(true);
    acceptAttribution.mockResolvedValue({ outcome: 'confirmed', amountRM: 1.65 });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ outcome: 'confirmed', amountRM: 1.65 });
    expect(acceptAttribution).toHaveBeenCalledWith({}, ATTRIBUTION_ID);
  });

  it('returns a safe uncertain-result message and Request ID for internal errors', async () => {
    isSuperAdmin.mockResolvedValue(true);
    acceptAttribution.mockResolvedValue({ outcome: 'error', error: 'permission denied: internal schema secret' });

    const response = await call();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.error.message).toMatch(/refresh/i);
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('internal schema secret');
  });

  it('returns 200 for a skipped outcome (e.g. already resolved) rather than an error', async () => {
    isSuperAdmin.mockResolvedValue(true);
    acceptAttribution.mockResolvedValue({ outcome: 'skipped', error: 'Already confirmed' });

    const response = await call();
    expect(response.status).toBe(200);
  });

  it('prevents manual acceptance while a guest commission review is pending', async () => {
    isSuperAdmin.mockResolvedValue(true);
    acceptAttribution.mockResolvedValue({ outcome: 'review_required', error: 'Resolve the guest commission review first' });
    expect((await call()).status).toBe(409);
  });

  it('returns an actionable conflict while the order still needs operational review', async () => {
    isSuperAdmin.mockResolvedValue(true);
    acceptAttribution.mockResolvedValue({ outcome: 'order_review_required', reason: 'pickup_unconfirmed' });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/order/i);
    expect(JSON.stringify(body)).not.toMatch(/database|SQLSTATE|exception/i);
  });
});
