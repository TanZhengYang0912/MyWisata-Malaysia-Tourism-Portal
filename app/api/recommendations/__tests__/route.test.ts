import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));

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
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability, allowed: true, blockerCode: null, qualificationPaths: [],
      entitlementGeneration: 7, source: 'policy',
    }));
  });

  it('returns the canonical profile capability blocker before recommendation side effects', async () => {
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: 'recommendation.submit', allowed: false,
      blockerCode: 'PROFILE_OR_KYC_REQUIRED',
      qualificationPaths: [
        { type: 'profile', href: '/customer/profile' },
        { type: 'kyc', href: '/customer/kyc' },
      ],
      entitlementGeneration: 7, source: 'hard_guard',
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'PROFILE_OR_KYC_REQUIRED',
        details: {
          capability: 'recommendation.submit',
        },
      },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('stores a server-derived internal Place suggestion after a successful Google location submission', async () => {
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
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith('user-1', 'recommendation.submit');
    expect(update).toHaveBeenCalledWith({ suggested_place_id: 'internal-ipoh', place_resolution_status: 'suggested' });
  });

  it('accepts a KYC-only entitlement without loading Profile completion facts', async () => {
    mocks.rpc.mockResolvedValue({ data: '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe', error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'places') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
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
    expect(mocks.from).not.toHaveBeenCalledWith('users');
  });
});
