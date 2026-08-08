import { describe, expect, it } from 'vitest';
import { buildAdminRecommendationDetail } from '@/lib/recommendations/admin-detail';

describe('buildAdminRecommendationDetail', () => {
  it('maps complete submission and review evidence without leaking storage paths', () => {
    const detail = buildAdminRecommendationDetail({
      recommendation: {
        id: 'rec-1',
        recommender_id: 'user-1',
        vendor_name: 'Kedai Kopi',
        description: 'A detailed description',
        why_recommend: 'Excellent local food',
        category_id: 'category-1',
        state: 'Selangor',
        vendor_address: 'Legacy address',
        google_place_id: 'place-1',
        location_name: 'Kedai Kopi Damansara',
        formatted_address: '1 Jalan Example',
        latitude: 3.1,
        longitude: 101.6,
        contact_phone: '+60123456789',
        contact_email: 'vendor@example.com',
        contact_website: 'https://example.com',
        image_attested_at: '2026-08-07T01:00:00Z',
        status: 'rejected',
        reviewer_id: 'admin-1',
        reviewed_at: '2026-08-07T02:00:00Z',
        rejection_reason: 'Insufficient evidence',
        changes_requested_at: null,
        changes_requested_reason: null,
        converted_vendor_id: null,
        created_at: '2026-08-07T00:00:00Z',
        categories: { name: 'Food' },
      },
      recommender: {
        id: 'user-1',
        full_name: 'Contributor One',
        email: 'contributor@example.com',
        kyc_status: 'approved',
      },
      reviewer: {
        id: 'admin-1',
        full_name: 'Admin One',
        email: 'admin@example.com',
      },
      convertedVendor: null,
      images: [{
        id: 'image-1',
        sort_order: 0,
        created_at: '2026-08-07T00:05:00Z',
        signedUrl: 'https://signed.example/image.jpg',
      }],
    });

    expect(detail.category).toBe('Food');
    expect(detail.author).toEqual({
      id: 'user-1',
      name: 'Contributor One',
      email: 'contributor@example.com',
      isKycVerified: true,
    });
    expect(detail.review?.reason).toBe('Insufficient evidence');
    expect(detail.images).toEqual([{
      id: 'image-1',
      url: 'https://signed.example/image.jpg',
      sortOrder: 0,
      createdAt: '2026-08-07T00:05:00Z',
    }]);
    expect(JSON.stringify(detail)).not.toContain('storage_path');
  });

  it('keeps legacy submissions readable when evidence fields are missing', () => {
    const detail = buildAdminRecommendationDetail({
      recommendation: {
        id: 'legacy-1',
        recommender_id: 'user-1',
        vendor_name: 'Legacy Vendor',
        description: null,
        why_recommend: null,
        category_id: null,
        state: null,
        vendor_address: null,
        google_place_id: null,
        location_name: null,
        formatted_address: null,
        latitude: null,
        longitude: null,
        contact_phone: null,
        contact_email: null,
        contact_website: null,
        image_attested_at: null,
        status: 'pending',
        reviewer_id: null,
        reviewed_at: null,
        rejection_reason: null,
        changes_requested_at: null,
        changes_requested_reason: null,
        converted_vendor_id: null,
        created_at: '2026-08-07T00:00:00Z',
        categories: null,
      },
      recommender: null,
      reviewer: null,
      convertedVendor: null,
      images: [],
    });

    expect(detail.location).toBeNull();
    expect(detail.review).toBeNull();
    expect(detail.images).toEqual([]);
    expect(detail.author.name).toBe('MyWisata member');
  });
});
