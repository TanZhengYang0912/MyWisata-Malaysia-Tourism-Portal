import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
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

  it('stores a server-derived internal Place suggestion after a successful Google location submission', async () => {
    mocks.single.mockResolvedValue({
      data: { tier: 'profile_complete', full_name: 'Aisha Ali', avatar_url: 'https://example.com/avatar.jpg', bio: 'Local travel writer who recommends reliable places.', city: 'Kuala Lumpur', country: 'Malaysia' },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe', error: null });
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'places') return { select: () => ({ eq: async () => ({ data: [{ id: 'internal-ipoh', name: 'Ipoh Railway Station', level: 'poi', lat: 4.5978, lng: 101.0787 }], error: null }) }) };
      if (table === 'vendor_recommendations') return { update };
      throw new Error(`unexpected service table ${table}`);
    });

    const response = await POST(new Request('http://localhost/api/recommendations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vendorName: 'Kedai Amanah', description: 'A reliable local coffee shop with thoughtful service.', whyRecommend: 'The staff are welcoming and the food is consistently excellent.', categoryId: '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe',
        location: { placeId: 'google-place-id', name: 'Kedai Amanah', formattedAddress: '1 Jalan Station, Ipoh, Perak', latitude: 4.598, longitude: 101.079 },
        contact: { website: 'https://example.com' }, stagedImageIds: ['4bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe'], imageAttested: true,
      }),
    }));

    expect(response.status).toBe(201);
    expect(update).toHaveBeenCalledWith({ suggested_place_id: 'internal-ipoh', place_resolution_status: 'suggested' });
  });
});
