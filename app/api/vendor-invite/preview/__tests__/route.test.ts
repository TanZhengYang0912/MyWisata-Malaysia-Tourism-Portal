import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userFrom: vi.fn(),
  serviceFrom: vi.fn(),
  createSignedUrl: vi.fn(),
  resolveActiveVendorInvite: vi.fn(),
  recommendation: null as Record<string, unknown> | null,
  images: [] as Array<Record<string, unknown>>,
  categories: [] as Array<Record<string, unknown>>,
  categoriesEq: vi.fn(),
  categoriesOrder: vi.fn(),
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

vi.mock('@/lib/recommendations/vendor-invite-access', () => ({
  resolveActiveVendorInvite: mocks.resolveActiveVendorInvite,
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
    mocks.resolveActiveVendorInvite.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'owner@example.com' } });
    mocks.recommendation = {
      id: 'rec-1', vendor_name: 'Rasa Malaysia Kitchen', status: 'invited',
      description: 'Local Malaysian food in Kuala Lumpur.',
      why_recommend: 'Consistent food, welcoming service, and a convenient location.',
      location_name: 'Rasa Malaysia Kitchen', formatted_address: '12 Jalan Alor, Kuala Lumpur',
      vendor_address: null, contact_email: 'owner@example.com', contact_phone: '+60123456789',
      category_id: 'food-uuid', latitude: 3.1469, longitude: 101.7113,
      categories: { id: 'food-uuid', name: 'Food', slug: 'food' },
    };
    mocks.images = [{ id: 'image-1', storage_path: 'private/rec-1/image.jpg', sort_order: 0 }];
    mocks.categories = [
      { id: 'food-uuid', name: 'Food', slug: 'food' },
      { id: 'activity-uuid', name: 'Activity', slug: 'activity' },
    ];
    mocks.categoriesEq.mockImplementation((column: string, value: unknown) => {
      if (column !== 'is_active' || value !== true) {
        throw new Error(`Unexpected categories filter ${column}=${String(value)}`);
      }
      return { order: mocks.categoriesOrder };
    });
    mocks.categoriesOrder.mockImplementation((column: string, options: unknown) => {
      if (column !== 'sort_order' || JSON.stringify(options) !== JSON.stringify({ ascending: true })) {
        throw new Error(`Unexpected categories order ${column}=${JSON.stringify(options)}`);
      }
      return Promise.resolve({ data: mocks.categories, error: null });
    });
    mocks.profile = { phone: '+60112223344', phone_verified_at: '2026-08-01T00:00:00.000Z' };
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.userFrom.mockImplementation(() => singleResult(mocks.profile));
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/image.jpg' }, error: null });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'vendor_recommendations') return singleResult(mocks.recommendation);
      if (table === 'categories') {
        return {
          select: vi.fn(() => ({
            eq: mocks.categoriesEq,
          })),
        };
      }
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
        account: {
          authenticated: false,
          emailMatched: false,
          phoneVerified: false,
          maskedInviteEmail: 'o***@example.com',
          maskedVerifiedPhone: null,
        },
        categories: mocks.categories,
        recommendation: { categoryId: 'food-uuid', categoryName: 'Food', latitude: 3.1469, longitude: 101.7113 },
        maskedContact: { email: 'o***@example.com', phone: '********6789' },
        prefill: { categoryId: 'food-uuid', outletName: 'Rasa Malaysia Kitchen', contactEmail: null, contactPhone: null, latitude: 3.1469, longitude: 101.7113 },
      },
    });
    expect(JSON.stringify(body)).not.toContain('storage_path');
    expect(JSON.stringify(body)).not.toContain('private/rec-1');
    expect(JSON.stringify(body)).not.toContain('recommender');
    expect(JSON.stringify(body)).not.toContain('valid-invite-token-value');
    expect(mocks.userFrom).not.toHaveBeenCalled();
    expect(mocks.categoriesEq).toHaveBeenCalledWith('is_active', true);
    expect(mocks.categoriesOrder).toHaveBeenCalledWith('sort_order', { ascending: true });
  });

  it('unlocks contacts for the authenticated invitation email', async () => {
    mocks.resolveActiveVendorInvite.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: ' owner@example.com ' } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: ' OWNER@EXAMPLE.COM ' } }, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toMatchObject({
      data: {
        account: {
          authenticated: true,
          emailMatched: true,
          phoneVerified: true,
          maskedVerifiedPhone: '********3344',
        },
        prefill: { contactEmail: 'owner@example.com', contactPhone: '+60123456789' },
      },
    });
    expect(mocks.userFrom).toHaveBeenCalledTimes(1);
  });

  it('does not query private phone data for an authenticated email mismatch', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-2', email: 'other@example.com' } }, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toMatchObject({ data: { account: { authenticated: true, emailMatched: false, phoneVerified: false, maskedVerifiedPhone: null }, prefill: { contactEmail: null, contactPhone: null } } });
    expect(mocks.userFrom).not.toHaveBeenCalled();
  });

  it('passes resolver lifecycle errors through with their stable code and status', async () => {
    mocks.resolveActiveVendorInvite.mockResolvedValue({ ok: false, error: { code: 'INVITE_EXPIRED', message: 'This invitation has expired.', status: 409 } });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVITE_EXPIRED' } });
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});
