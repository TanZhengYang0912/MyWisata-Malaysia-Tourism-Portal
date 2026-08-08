import { describe, expect, it } from 'vitest';
import {
  buildVendorInvitePreview,
  maskInviteEmail,
  maskInvitePhone,
  type VendorInvitePreviewInput,
} from '@/lib/recommendations/vendor-invite-preview';

const baseInput: VendorInvitePreviewInput = {
  authenticated: false,
  emailMatched: false,
  phoneVerified: false,
  recommendation: {
    vendorName: 'Rasa Malaysia Kitchen',
    description: 'Local Malaysian food in the heart of Kuala Lumpur.',
    whyRecommend: 'Consistent food, a welcoming team, and a convenient location.',
    category: 'Food',
    locationName: 'Rasa Malaysia Kitchen',
    formattedAddress: '12 Jalan Alor, Kuala Lumpur',
    fallbackAddress: null,
    contactEmail: 'owner@example.com',
    contactPhone: '+60123456789',
  },
  images: [{ id: 'image-1', signedUrl: 'https://signed.example/image-1' }],
};

describe('vendor invitation preview mapping', () => {
  it('pre-fills safe fields while withholding private contacts', () => {
    const preview = buildVendorInvitePreview(baseInput);

    expect(preview.prefill).toEqual({
      businessName: 'Rasa Malaysia Kitchen',
      legalBusinessName: 'Rasa Malaysia Kitchen',
      businessType: 'Food',
      contactEmail: null,
      contactPhone: null,
      businessAddress: '12 Jalan Alor, Kuala Lumpur',
    });
    expect(preview.maskedContact).toEqual({
      email: 'o***@example.com',
      phone: '********6789',
    });
    expect(JSON.stringify(preview)).not.toContain('recommender');
  });

  it('reveals contacts only after the invitation email matches', () => {
    const preview = buildVendorInvitePreview({
      ...baseInput,
      authenticated: true,
      emailMatched: true,
      phoneVerified: true,
    });

    expect(preview.prefill.contactEmail).toBe('owner@example.com');
    expect(preview.prefill.contactPhone).toBe('+60123456789');
    expect(preview.phoneVerified).toBe(true);
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
