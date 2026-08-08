import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  auditAndNotify: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              recommender_id: '22222222-2222-4222-8222-222222222222',
              vendor_name: 'Kedai Amanah',
              status: 'pending',
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mocks.serviceFrom,
    rpc: async () => ({ data: [], error: null }),
  }),
}));

vi.mock('@/lib/audit', () => ({
  auditAndNotify: mocks.auditAndNotify,
}));

const { POST } = await import('../review/route');

describe('POST /api/admin/recommendations/review', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
    mocks.auditAndNotify.mockReset();
    mocks.serviceFrom.mockReset();

    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.auditAndNotify.mockResolvedValue({ notification_count: 1 });
  });

  it('enqueues an idempotent email after approving a recommendation', async () => {
    const upsert = vi.fn(() => ({
      select: () => ({
        maybeSingle: async () => ({ data: { id: 'outbox-1' }, error: null }),
      }),
    }));

    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { email: 'customer@example.com', full_name: 'Aina' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'email_outbox') return { upsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await POST(new Request('http://localhost/api/admin/recommendations/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendationId: '33333333-3333-4333-8333-333333333333',
        action: 'approve',
      }),
    }));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      event_key: 'recommendation_approved:33333333-3333-4333-8333-333333333333',
      user_id: '22222222-2222-4222-8222-222222222222',
      to_email: 'customer@example.com',
      event_type: 'recommendation_approved',
    }), expect.objectContaining({
      onConflict: 'event_key',
      ignoreDuplicates: true,
    }));
  });
});
