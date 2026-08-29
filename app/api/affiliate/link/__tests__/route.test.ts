import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
  getAffiliateLink: vi.fn(),
  getOrCreateAffiliateLink: vi.fn(),
  getMonthlyClickCap: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));
vi.mock('@/lib/affiliate/links', () => ({
  affiliateUrl: (origin: string, code: string) => `${origin}/ref/${code}`,
  getAffiliateLink: mocks.getAffiliateLink,
  getOrCreateAffiliateLink: mocks.getOrCreateAffiliateLink,
}));
vi.mock('@/lib/affiliate/settings', () => ({ getMonthlyClickCap: mocks.getMonthlyClickCap }));

import { POST } from '../route';

const userId = '11111111-1111-4111-8111-111111111111';
const link = { affiliateCode: 'AF-KYC123' };

function request() {
  return new Request('http://localhost/api/affiliate/link', { method: 'POST' });
}

describe('POST /api/affiliate/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } } });
    mocks.getOrCreateAffiliateLink.mockResolvedValue({ link, created: true });
    mocks.getMonthlyClickCap.mockResolvedValue(50);
  });

  it('grants Full mode directly to KYC-only users', async () => {
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability,
      allowed: capability === 'affiliate.full',
      blockerCode: capability === 'affiliate.full' ? null : 'ENTITLEMENT_DENIED',
      qualificationPaths: [],
      entitlementGeneration: 7,
      source: capability === 'affiliate.full' ? 'policy' : 'default_deny',
    }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { mode: 'full', limits: null, affiliateCode: 'AF-KYC123' },
    });
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith(userId, 'affiliate.full');
    expect(mocks.getOrCreateAffiliateLink).toHaveBeenCalledOnce();
    expect(mocks.getMonthlyClickCap).not.toHaveBeenCalled();
  });

  it('falls back to Limited mode for Profile-complete users', async () => {
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability,
      allowed: capability === 'affiliate.limited',
      blockerCode: capability === 'affiliate.limited' ? null : 'KYC_REQUIRED',
      qualificationPaths: capability === 'affiliate.limited' ? [] : [{ type: 'kyc', href: '/customer/kyc' }],
      entitlementGeneration: 7,
      source: capability === 'affiliate.limited' ? 'policy' : 'hard_guard',
    }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { mode: 'limited', limits: { clicksPerMonth: 50 } },
    });
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith(userId, 'affiliate.full');
    expect(mocks.resolveEffectiveCapability).toHaveBeenCalledWith(userId, 'affiliate.limited');
  });

  it('returns the canonical denial before creating a link', async () => {
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability,
      allowed: false,
      blockerCode: capability === 'affiliate.full' ? 'KYC_REQUIRED' : 'PROFILE_REQUIRED',
      qualificationPaths: capability === 'affiliate.full'
        ? [{ type: 'kyc', href: '/customer/kyc' }]
        : [{ type: 'profile', href: '/customer/profile' }],
      entitlementGeneration: 7,
      source: 'hard_guard',
    }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PROFILE_REQUIRED', details: { capability: 'affiliate.limited' } },
    });
    expect(mocks.getOrCreateAffiliateLink).not.toHaveBeenCalled();
  });
});
