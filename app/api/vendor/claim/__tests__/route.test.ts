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
  description: 'Malaysian food and local dining experiences.',
  categoryId: '11111111-0000-4000-8000-000000000001',
  outletName: 'Rasa Malaysia Kitchen — Jalan Alor',
  contactEmail: 'owner@example.com',
  contactPhone: '',
  businessAddress: '12 Jalan Alor, Kuala Lumpur',
  latitude: 3.145,
  longitude: 101.708,
  authorizedToRepresent: true,
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
    mocks.rpc.mockResolvedValue({
      data: { vendor_id: 'vendor-1', outlet_id: 'outlet-1', recommendation_id: 'rec-1', status: 'onboarding' },
      error: null,
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_vendor_recommendation', {
      p_token_hash: hashRecommendationInviteToken(validBody.token),
      p_business_name: validBody.businessName,
      p_legal_business_name: validBody.legalBusinessName,
      p_description: validBody.description,
      p_category_id: validBody.categoryId,
      p_outlet_name: validBody.outletName,
      p_contact_email: validBody.contactEmail,
      p_contact_phone: null,
      p_business_address: validBody.businessAddress,
      p_latitude: validBody.latitude,
      p_longitude: validBody.longitude,
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { vendor_id: 'vendor-1', outlet_id: 'outlet-1', recommendation_id: 'rec-1', status: 'onboarding' },
    });
  });

  it.each([
    ['authorization', { authorizedToRepresent: false }],
    ['category UUID', { categoryId: 'food' }],
    ['outlet name', { outletName: '' }],
    ['latitude', { latitude: 90.1 }],
    ['longitude', { longitude: -180.1 }],
  ])('rejects an invalid %s before claiming', async (_field, override) => {
    const response = await POST(request({ ...validBody, ...override }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires both coordinates', async () => {
    const bodyWithoutCoordinates: Record<string, unknown> = { ...validBody };
    delete bodyWithoutCoordinates.latitude;
    delete bodyWithoutCoordinates.longitude;

    const response = await POST(request(bodyWithoutCoordinates));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires phone verification before consuming a claim invite', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { phone_verified_at: null }, error: null });

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['invite_not_found', 'INVITE_INVALID', 404],
    ['invite_expired', 'INVITE_EXPIRED', 409],
    ['invite_already_claimed', 'INVITE_ALREADY_CLAIMED', 409],
    ['invite_email_mismatch', 'INVITE_EMAIL_MISMATCH', 409],
    ['category_not_active', 'CATEGORY_NOT_ACTIVE', 409],
    ['phone_verification_required', 'PHONE_VERIFICATION_REQUIRED', 403],
  ])('maps %s to %s', async (dbCode, apiCode, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: dbCode } });

    const response = await POST(request(validBody));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code: apiCode } });
  });
});
