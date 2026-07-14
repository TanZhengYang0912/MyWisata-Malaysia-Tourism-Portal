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
  });

  it('sends structured catalog reasons to the hardened RPC', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    rpc.mockResolvedValue({ error: null });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        action: 'reject',
        reasonCode: 'other',
        reasonDetail: '  The document image has an obscured security feature.  ',
      }),
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('admin_review_kyc', {
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
      body: JSON.stringify({ userId, action: 'reject', reasonCode: 'unknown' }),
    }));

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
