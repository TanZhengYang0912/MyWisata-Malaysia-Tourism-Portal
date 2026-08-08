export type VendorInvitePreviewInput = {
  inviteEmail: string;
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
  verifiedPhone: string | null;
  categories: VendorInviteCategory[];
  recommendation: {
    vendorName: string;
    description: string | null;
    whyRecommend: string | null;
    categoryId: string | null;
    categoryName: string | null;
    locationName: string | null;
    formattedAddress: string | null;
    fallbackAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  images: Array<{ id: string; signedUrl: string }>;
};

export type VendorInviteCategory = { id: string; name: string; slug: string };

export type VendorInvitePreview = {
  account: {
    authenticated: boolean;
    emailMatched: boolean;
    phoneVerified: boolean;
    maskedInviteEmail: string;
    maskedVerifiedPhone: string | null;
  };
  categories: VendorInviteCategory[];
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
  recommendation: {
    businessName: string;
    description: string | null;
    whyRecommend: string | null;
    categoryId: string | null;
    categoryName: string | null;
    category: string | null;
    locationName: string | null;
    formattedAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    images: Array<{ id: string; url: string }>;
  };
  maskedContact: { email: string | null; phone: string | null };
  prefill: {
    businessName: string;
    legalBusinessName: string;
    description: string;
    categoryId: string;
    outletName: string;
    businessType: string;
    contactEmail: string | null;
    contactPhone: string | null;
    businessAddress: string;
    latitude: number | null;
    longitude: number | null;
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
    account: {
      authenticated: input.authenticated,
      emailMatched: input.emailMatched,
      phoneVerified: input.phoneVerified,
      maskedInviteEmail: maskInviteEmail(input.inviteEmail) ?? '***',
      maskedVerifiedPhone: input.phoneVerified && revealContact ? maskInvitePhone(input.verifiedPhone) : null,
    },
    categories: input.categories,
    authenticated: input.authenticated,
    emailMatched: input.emailMatched,
    phoneVerified: input.phoneVerified,
    recommendation: {
      businessName: recommendation.vendorName,
      description: recommendation.description,
      whyRecommend: recommendation.whyRecommend,
      categoryId: recommendation.categoryId,
      categoryName: recommendation.categoryName,
      category: recommendation.categoryName,
      locationName: recommendation.locationName,
      formattedAddress: recommendation.formattedAddress ?? recommendation.fallbackAddress,
      latitude: recommendation.latitude,
      longitude: recommendation.longitude,
      images: input.images.map((image) => ({ id: image.id, url: image.signedUrl })),
    },
    maskedContact: {
      email: maskInviteEmail(recommendation.contactEmail),
      phone: maskInvitePhone(recommendation.contactPhone),
    },
    prefill: {
      businessName: recommendation.vendorName,
      legalBusinessName: recommendation.vendorName,
      description: recommendation.description ?? '',
      categoryId: recommendation.categoryId ?? '',
      outletName: recommendation.locationName ?? recommendation.vendorName,
      businessType: recommendation.categoryName ?? '',
      contactEmail: revealContact ? recommendation.contactEmail : null,
      contactPhone: revealContact ? recommendation.contactPhone : null,
      businessAddress: recommendation.formattedAddress ?? recommendation.fallbackAddress ?? '',
      latitude: recommendation.latitude,
      longitude: recommendation.longitude,
    },
  };
}
