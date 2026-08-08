import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userFrom: vi.fn(),
  serviceFrom: vi.fn(),
  createSignedUrl: vi.fn(),
  invite: null as Record<string, unknown> | null,
  recommendation: null as Record<string, unknown> | null,
  images: [] as Array<Record<string, unknown>>,
  profile: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.userFrom })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mocks.serviceFrom,
    storage: { from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl })) },
  })),
}));

import { POST } from '@/app/api/vendor-invite/preview/route';

function request(token = 'valid-invite-token-value') {
  return new Request('http://localhost/api/vendor-invite/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

function singleResult(data: unknown) {
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) })) })) };
}

describe('POST /api/vendor-invite/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invite = {
      recommendation_id: 'rec-1',
      email: 'owner@example.com',
      status: 'invited',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    mocks.recommendation = {
      id: 'rec-1', vendor_name: 'Rasa Malaysia Kitchen', status: 'invited',
      description: 'Local Malaysian food in Kuala Lumpur.',
      why_recommend: 'Consistent food, welcoming service, and a convenient location.',
      location_name: 'Rasa Malaysia Kitchen', formatted_address: '12 Jalan Alor, Kuala Lumpur',
      vendor_address: null, contact_email: 'owner@example.com', contact_phone: '+60123456789',
      categories: { name: 'Food' },
    };
    mocks.images = [{ id: 'image-1', storage_path: 'private/rec-1/image.jpg', sort_order: 0 }];
    mocks.profile = { phone_verified_at: '2026-08-01T00:00:00.000Z' };
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.userFrom.mockImplementation(() => singleResult(mocks.profile));
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/image.jpg' }, error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'vendor_recommendation_invites') return singleResult(mocks.invite);
      if (table === 'vendor_recommendations') return singleResult(mocks.recommendation);
      if (table === 'recommendation_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: mocks.images, error: null }) })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('returns only masked contact values to a signed-out recipient', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        authenticated: false,
        emailMatched: false,
        maskedContact: { email: 'o***@example.com', phone: '********6789' },
        prefill: { contactEmail: null, contactPhone: null },
      },
    });
    expect(JSON.stringify(body)).not.toContain('storage_path');
    expect(JSON.stringify(body)).not.toContain('private/rec-1');
  });

  it('unlocks contacts for the authenticated invitation email', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'OWNER@example.com' } }, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toMatchObject({
      data: {
        authenticated: true,
        emailMatched: true,
        phoneVerified: true,
        prefill: { contactEmail: 'owner@example.com', contactPhone: '+60123456789' },
      },
    });
  });

  it('returns a stable expired invitation error', async () => {
    mocks.invite = { ...mocks.invite, expires_at: '2020-01-01T00:00:00.000Z' };

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_EXPIRED' } });
  });

  it('returns a stable already-claimed error', async () => {
    mocks.invite = { ...mocks.invite, status: 'claimed' };

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_ALREADY_CLAIMED' } });
  });
});
