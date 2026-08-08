import { describe, expect, it } from 'vitest';
import {
  buildVendorInvitePreview,
  maskInviteEmail,
  maskInvitePhone,
  type VendorInvitePreviewInput,
} from '@/lib/recommendations/vendor-invite-preview';

const baseInput: VendorInvitePreviewInput = {
  inviteEmail: 'owner@example.com',
  authenticated: false,
  emailMatched: false,
  phoneVerified: false,
  verifiedPhone: null,
  categories: [
    { id: 'food-uuid', name: 'Food', slug: 'food' },
    { id: 'activity-uuid', name: 'Activity', slug: 'activity' },
  ],
  recommendation: {
    vendorName: 'Rasa Malaysia Kitchen',
    description: 'Local Malaysian food in the heart of Kuala Lumpur.',
    whyRecommend: 'Consistent food, a welcoming team, and a convenient location.',
    categoryId: 'food-uuid',
    categoryName: 'Food',
    locationName: 'Rasa Malaysia Kitchen',
    formattedAddress: '12 Jalan Alor, Kuala Lumpur',
    fallbackAddress: null,
    latitude: 3.1469,
    longitude: 101.7113,
    contactEmail: 'owner@example.com',
    contactPhone: '+60123456789',
  },
  images: [{ id: 'image-1', signedUrl: 'https://signed.example/image-1' }],
};

describe('vendor invitation preview mapping', () => {
  it('returns anonymous preview with masked invitation email and no private contact prefill', () => {
    const preview = buildVendorInvitePreview(baseInput);

    expect(preview.account).toEqual({
      authenticated: false,
      emailMatched: false,
      phoneVerified: false,
      maskedInviteEmail: 'o***@example.com',
      maskedVerifiedPhone: null,
    });
    expect(preview).toMatchObject({
      authenticated: false,
      emailMatched: false,
      phoneVerified: false,
      recommendation: { category: 'Food' },
      prefill: { businessType: 'Food' },
    });
    expect(preview.categories).toEqual(baseInput.categories);
    expect(preview.prefill).toEqual({
      businessName: 'Rasa Malaysia Kitchen',
      legalBusinessName: 'Rasa Malaysia Kitchen',
      description: 'Local Malaysian food in the heart of Kuala Lumpur.',
      categoryId: 'food-uuid',
      outletName: 'Rasa Malaysia Kitchen',
      businessType: 'Food',
      contactEmail: null,
      contactPhone: null,
      businessAddress: '12 Jalan Alor, Kuala Lumpur',
      latitude: 3.1469,
      longitude: 101.7113,
    });
    expect(preview.recommendation).toMatchObject({
      categoryId: 'food-uuid',
      categoryName: 'Food',
      latitude: 3.1469,
      longitude: 101.7113,
      images: [{ id: 'image-1', url: 'https://signed.example/image-1' }],
    });
    expect(preview.maskedContact).toEqual({
      email: 'o***@example.com',
      phone: '********6789',
    });
    expect(JSON.stringify(preview)).not.toMatch(/recommender|storage_path/);
  });

  it('returns a masked verified phone and contact prefill to a matching authenticated user', () => {
    const preview = buildVendorInvitePreview({
      ...baseInput,
      authenticated: true,
      emailMatched: true,
      phoneVerified: true,
      verifiedPhone: '+60112223344',
    });

    expect(preview.prefill.contactEmail).toBe('owner@example.com');
    expect(preview.prefill.contactPhone).toBe('+60123456789');
    expect(preview.account).toMatchObject({
      authenticated: true,
      emailMatched: true,
      phoneVerified: true,
      maskedVerifiedPhone: '********3344',
    });
  });

  it('falls back to the stored vendor address', () => {
    const preview = buildVendorInvitePreview({
      ...baseInput,
      recommendation: {
        ...baseInput.recommendation,
        formattedAddress: null,
        fallbackAddress: '44 Jalan Damansara, Kuala Lumpur',
      },
    });

    expect(preview.prefill.businessAddress).toBe('44 Jalan Damansara, Kuala Lumpur');
  });

  it('masks contact values without reproducing their originals', () => {
    expect(maskInviteEmail('owner@example.com')).toBe('o***@example.com');
    expect(maskInvitePhone('+60123456789')).toBe('********6789');
    expect(maskInviteEmail(null)).toBeNull();
    expect(maskInvitePhone(null)).toBeNull();
  });
});
