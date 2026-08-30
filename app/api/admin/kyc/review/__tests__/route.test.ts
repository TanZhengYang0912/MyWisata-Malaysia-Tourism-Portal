import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

const { POST } = await import('../route');

const userId = '11111111-1111-4111-8111-111111111111';

describe('POST /api/admin/kyc/review', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    rpc.mockImplementation(async (name: string) => {
      if (name === 'can_review_kyc') return { data: true, error: null };
      return { data: null, error: null };
    });
  });

  it('sends structured catalog reasons to the hardened RPC', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        action: 'reject',
        reasonCode: 'other',
        reasonDetail: '  The document image has an obscured security feature.  ',
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { userId, kycStatus: 'rejected', action: 'reject' },
    });
    expect(rpc).toHaveBeenCalledWith('admin_review_kyc', {
      p_submission_id: '33333333-3333-4333-8333-333333333333',
      p_user_id: userId,
      p_action: 'reject',
      p_reason_code: 'other',
      p_reason_detail: 'The document image has an obscured security feature.',
    });
  });

  it('rejects unknown reason codes before calling the RPC', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ submissionId: '33333333-3333-4333-8333-333333333333', userId, action: 'reject', reasonCode: 'unknown' }),
    }));

    expect(response.status).toBe(422);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('can_review_kyc', {
      uid: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects callers without the KYC review capability before deciding', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    rpc.mockResolvedValueOnce({ data: false, error: null });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ submissionId: '33333333-3333-4333-8333-333333333333', userId, action: 'approve' }),
    }));

    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('can_review_kyc', {
      uid: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('returns a conflict when a reviewer tries to decide another reviewer assignment', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'kyc_not_assigned' } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        action: 'approve',
      }),
    }));

    expect(response.status).toBe(409);
  });

  it('returns the independent KYC outcome without a synthetic tier', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        action: 'approve',
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ data: { userId, kycStatus: 'approved', action: 'approve' } });
    expect(body.data).not.toHaveProperty('tier');
  });
});
