import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { GET } from '../route';

describe('GET /api/admin/kyc/submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
  });

  it('rejects callers without the KYC review capability before loading the queue', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('has_staff_permission', {
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_permission_key: 'admin.kyc.review',
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('returns customer-safe queue identities without requiring a browser users query', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const submission = {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      document_type: 'national_id',
      status: 'pending',
      queue_position: 1,
      created_at: '2026-08-24T00:00:00.000Z',
      reviewed_at: null,
      reviewer_id: null,
      review_reason_code: null,
      review_reason_detail: null,
      kyc_submission_documents: [{ side: 'front' }, { side: 'back' }],
      kyc_ocr_results: [],
    };
    const kycQuery = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [submission], error: null }),
    };
    kycQuery.select.mockReturnValue(kycQuery);
    kycQuery.in.mockReturnValue(kycQuery);
    const usersSelect = vi.fn((
      _columns: string,
      options?: { count?: string; head?: boolean },
    ) => options?.head
      ? { eq: vi.fn().mockResolvedValue({ count: 4, error: null }) }
      : {
          in: vi.fn().mockResolvedValue({
            data: [{
              id: '33333333-3333-4333-8333-333333333333',
              email: 'customer@example.com',
              full_name: 'Customer Aina',
              tier: 'profile_complete',
            }],
            error: null,
          }),
        });
    const from = vi.fn((table: string) => {
      if (table === 'kyc_submissions') return kycQuery;
      if (table === 'users') return { select: usersSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createServiceClient.mockReturnValue({ from });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.customers).toEqual([{
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Customer Aina',
      email: 'customer@example.com',
      verificationTier: 'profile_complete',
    }]);
    expect(body.data.verifiedCount).toBe(4);
    expect(JSON.stringify(body)).not.toContain('phone');
  });
});
