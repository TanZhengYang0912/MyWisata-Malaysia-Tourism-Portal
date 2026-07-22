import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
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
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/vendor/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  token: 'invite-token-value',
  businessName: 'Rasa Malaysia Kitchen',
  legalBusinessName: 'Rasa Malaysia Kitchen Sdn Bhd',
  businessType: 'restaurant',
  contactEmail: 'owner@example.com',
  contactPhone: '+60123456789',
  businessAddress: '12 Jalan Alor, Kuala Lumpur',
};

describe('POST /api/vendor/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@example.com' } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { phone_verified_at: '2026-07-22T00:00:00.000Z' }, error: null });
  });

  it('claims an approved recommendation through the atomic RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { vendor_id: 'vendor-1', recommendation_id: 'rec-1', status: 'onboarding' }, error: null });

    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_vendor_recommendation', expect.objectContaining({
      p_token_hash: hashRecommendationInviteToken(validBody.token),
      p_business_name: validBody.businessName,
      p_contact_email: validBody.contactEmail,
    }));
  });

  it('requires phone verification before consuming a claim invite', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { phone_verified_at: null }, error: null });

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['invite_expired', 'INVITE_EXPIRED'],
    ['invite_already_claimed', 'INVITE_ALREADY_CLAIMED'],
    ['invite_email_mismatch', 'INVITE_EMAIL_MISMATCH'],
  ])('maps %s to %s', async (dbCode, apiCode) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: dbCode } });

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: apiCode } });
  });
});
