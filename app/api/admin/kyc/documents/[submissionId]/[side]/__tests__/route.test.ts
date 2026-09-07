import { describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient,
}));

const { GET } = await import('../route');

describe('GET /api/admin/kyc/documents/[submissionId]/[side]', () => {
  it('returns 401 before validating malformed route parameters', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId: 'not-a-uuid', side: 'unexpected' }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects callers without the KYC review capability before resolving a private path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({
        submissionId: '22222222-2222-4222-8222-222222222222',
        side: 'front',
      }),
    });

    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('has_staff_permission', {
      p_user_id: '33333333-3333-4333-8333-333333333333',
      p_permission_key: 'admin.kyc.review',
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
