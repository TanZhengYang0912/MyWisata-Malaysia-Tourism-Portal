import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/recommendations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vendorName: 'A recommended vendor',
      description: 'A sufficiently long recommendation description.',
      state: 'Selangor',
    }),
  });
}

describe('POST /api/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ single: mocks.single });
  });

  it('rejects an incomplete teacher-required profile before inserting a recommendation', async () => {
    mocks.single.mockResolvedValue({
      data: {
        tier: 'profile_complete',
        full_name: 'Aisha Ali',
        avatar_url: '/default-avatar.png',
        bio: 'Too short',
        city: 'Kuala Lumpur',
        country: 'Malaysia',
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PROFILE_INCOMPLETE', details: { missing: ['avatar', 'bio'] } },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
