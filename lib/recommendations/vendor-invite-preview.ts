export type VendorInvitePreviewInput = {
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
  recommendation: {
    vendorName: string;
    description: string | null;
    whyRecommend: string | null;
    category: string | null;
    locationName: string | null;
    formattedAddress: string | null;
    fallbackAddress: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  images: Array<{ id: string; signedUrl: string }>;
};

export type VendorInvitePreview = {
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
  recommendation: {
    businessName: string;
    description: string | null;
    whyRecommend: string | null;
    category: string | null;
    locationName: string | null;
    formattedAddress: string | null;
    images: Array<{ id: string; url: string }>;
  };
  maskedContact: { email: string | null; phone: string | null };
  prefill: {
    businessName: string;
    legalBusinessName: string;
    businessType: string;
    contactEmail: string | null;
    contactPhone: string | null;
    businessAddress: string;
  };
};

export function maskInviteEmail(value: string | null): string | null {
  if (!value) return null;
  const [local, domain] = value.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

export function maskInvitePhone(value: string | null): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(4, value.length - visible.length))}${visible}`;
}

export function buildVendorInvitePreview(input: VendorInvitePreviewInput): VendorInvitePreview {
  const { recommendation } = input;
  const revealContact = input.authenticated && input.emailMatched;
  return {
    authenticated: input.authenticated,
    emailMatched: input.emailMatched,
    phoneVerified: input.phoneVerified,
    recommendation: {
      businessName: recommendation.vendorName,
      description: recommendation.description,
      whyRecommend: recommendation.whyRecommend,
      category: recommendation.category,
      locationName: recommendation.locationName,
      formattedAddress: recommendation.formattedAddress ?? recommendation.fallbackAddress,
      images: input.images.map((image) => ({ id: image.id, url: image.signedUrl })),
    },
    maskedContact: {
      email: maskInviteEmail(recommendation.contactEmail),
      phone: maskInvitePhone(recommendation.contactPhone),
    },
    prefill: {
      businessName: recommendation.vendorName,
      legalBusinessName: recommendation.vendorName,
      businessType: recommendation.category ?? '',
      contactEmail: revealContact ? recommendation.contactEmail : null,
      contactPhone: revealContact ? recommendation.contactPhone : null,
      businessAddress: recommendation.formattedAddress ?? recommendation.fallbackAddress ?? '',
    },
  };
}
