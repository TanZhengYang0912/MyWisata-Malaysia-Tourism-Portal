import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: mocks.serviceFrom,
    rpc: async () => ({ data: [], error: null }),
  }),
}));

const { POST } = await import('../review/route');

describe('POST /api/admin/recommendations/review', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
    mocks.serviceFrom.mockReset();

    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'can_review_recommendation') return { data: true, error: null };
      if (name === 'admin_review_recommendation') {
        return {
          data: {
            recommendationId: '33333333-3333-4333-8333-333333333333',
            status: 'approved',
            recommenderId: '22222222-2222-4222-8222-222222222222',
            vendorName: 'Kedai Amanah',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
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
    expect(mocks.rpc).toHaveBeenCalledWith('admin_review_recommendation', {
      p_rec_id: '33333333-3333-4333-8333-333333333333',
      p_action: 'approve',
      p_internal_note: null,
      p_customer_message: null,
    });
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

  it('rejects callers without the recommendation review capability before loading the submission', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

    const response = await POST(new Request('http://localhost/api/admin/recommendations/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendationId: '33333333-3333-4333-8333-333333333333',
        action: 'approve',
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('can_review_recommendation', {
      uid: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('sends internal notes and customer messages as separate RPC fields', async () => {
    const response = await POST(new Request('http://localhost/api/admin/recommendations/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendationId: '33333333-3333-4333-8333-333333333333',
        action: 'request_changes',
        internalNote: 'Possible duplicate; compare before next review.',
        customerMessage: 'Please add a clearer storefront photo.',
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_review_recommendation', {
      p_rec_id: '33333333-3333-4333-8333-333333333333',
      p_action: 'request_changes',
      p_internal_note: 'Possible duplicate; compare before next review.',
      p_customer_message: 'Please add a clearer storefront photo.',
    });
  });

  it('does not expose raw database errors to the reviewer', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'can_review_recommendation') return { data: true, error: null };
      return { data: null, error: { message: 'sensitive schema and function stack' } };
    });

    const response = await POST(new Request('http://localhost/api/admin/recommendations/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recommendationId: '33333333-3333-4333-8333-333333333333',
        action: 'approve',
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('sensitive schema and function stack');
  });
});
