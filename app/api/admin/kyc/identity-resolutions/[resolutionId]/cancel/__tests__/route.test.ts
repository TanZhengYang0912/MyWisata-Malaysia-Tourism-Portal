import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const db = { rpc };
vi.mock('@/lib/kyc/reviewer-auth', () => ({
  requireKycReviewer: async () => ({ db, user: { id: '22222222-2222-4222-8222-222222222222' }, response: null }),
}));
const { POST } = await import('../route');
const resolutionId = '33333333-3333-4333-8333-333333333333';

describe('POST /api/admin/kyc/identity-resolutions/[resolutionId]/cancel', () => {
  beforeEach(() => rpc.mockReset());

  it('cancels with a versioned reason and returns only a safe status', async () => {
    rpc.mockResolvedValue({ error: null });
    const response = await POST(new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, reasonCode: 'evidence_unavailable' }),
    }), { params: Promise.resolve({ resolutionId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { cancelled: true }, error: null });
    expect(rpc).toHaveBeenCalledWith('cancel_kyc_identity_resolution', {
      p_resolution_id: resolutionId, p_expected_version: 2, p_reason_code: 'evidence_unavailable',
    });
  });

  it('rejects unknown input fields and maps assignment failures safely', async () => {
    const invalid = await POST(new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, reasonCode: 'other', documentNumber: '900101123456' }),
    }), { params: Promise.resolve({ resolutionId }) });
    expect(invalid.status).toBe(422);

    rpc.mockResolvedValue({ error: { message: 'kyc_identity_resolution_assignment_required' } });
    const denied = await POST(new Request('http://localhost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, reasonCode: 'other' }),
    }), { params: Promise.resolve({ resolutionId }) });
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain('assignment_required');
  });
});
