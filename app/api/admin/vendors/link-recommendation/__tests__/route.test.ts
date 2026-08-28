import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  auditAndNotify: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  })),
}));

vi.mock('@/lib/audit', () => ({ auditAndNotify: mocks.auditAndNotify }));

import { POST } from '../route';

describe('POST /api/admin/vendors/link-recommendation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
  });

  it('rejects callers without recommendation review capability before reading conversion data', async () => {
    const response = await POST(new Request('http://localhost/api/admin/vendors/link-recommendation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vendorId: '22222222-2222-4222-8222-222222222222',
        recommendationId: '33333333-3333-4333-8333-333333333333',
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith('can_review_recommendation', {
      uid: '11111111-1111-4111-8111-111111111111',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.auditAndNotify).not.toHaveBeenCalled();
  });
});
