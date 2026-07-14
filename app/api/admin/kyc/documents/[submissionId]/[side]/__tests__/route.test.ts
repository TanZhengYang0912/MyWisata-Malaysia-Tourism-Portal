import { describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
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
});
