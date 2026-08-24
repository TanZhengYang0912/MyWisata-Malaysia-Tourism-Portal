export type RecommendationReviewStatus =
  | 'pending'
  | 'changes_requested'
  | 'approved'
  | 'invited'
  | 'claimed'
  | 'onboarding'
  | 'vendor_pending_review'
  | 'rejected'
  | 'converted';

export interface AdminRecommendationDetail {
  id: string;
  name: string;
  description: string | null;
  whyRecommend: string | null;
  category: string | null;
  state: string | null;
  location: {
    placeId: string | null;
    name: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  contact: {
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  images: Array<{
    id: string;
    url: string;
    sortOrder: number;
    createdAt: string;
  }>;
  author: {
    id: string;
    name: string;
    email: string | null;
    isKycVerified: boolean;
  };
  submittedAt: string;
  imageAttestedAt: string | null;
  status: RecommendationReviewStatus;
  assignment: {
    assignedTo: string | null;
    claimedAt: string | null;
    isAssignedToActor: boolean;
    canDecide: boolean;
  };
  availableActions: Array<'approve' | 'request_changes' | 'reject'>;
  reviewEvents: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    action: 'approve' | 'request_changes' | 'reject';
    actor: { id: string | null; name: string };
    actorRole: string;
    internalNote: string | null;
    customerMessage: string;
    createdAt: string;
  }>;
  review: {
    reviewer: {
      id: string;
      name: string;
      email: string | null;
    } | null;
    reviewedAt: string | null;
    reason: string | null;
    changesRequestedAt: string | null;
  } | null;
  conversion: {
    vendorId: string;
    vendorName: string | null;
  } | null;
  localization: {
    suggestedPlace: { id: string; name: string; level: string } | null;
    resolvedPlace: { id: string; name: string; level: string } | null;
    translations: Array<{
      id: string;
      field: 'name' | 'description';
      locale: 'zh-CN' | 'ms';
      sourceText: string;
      translatedText: string;
      status: 'draft' | 'approved' | 'rejected' | 'stale';
    }>;
  };
}

export interface RecommendationDetailRow {
  id: string;
  recommender_id: string;
  vendor_name: string;
  description: string | null;
  why_recommend: string | null;
  category_id: string | null;
  state: string | null;
  vendor_address: string | null;
  google_place_id: string | null;
  location_name: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
  image_attested_at: string | null;
  status: RecommendationReviewStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  changes_requested_at: string | null;
  changes_requested_reason: string | null;
  converted_vendor_id: string | null;
  suggested_place_id?: string | null;
  resolved_place_id?: string | null;
  created_at: string;
  assigned_to?: string | null;
  claimed_at?: string | null;
  categories: { name: string } | Array<{ name: string }> | null;
}

interface UserSummaryRow {
  id: string;
  full_name: string | null;
  email: string | null;
  kyc_status?: string | null;
}

interface ConvertedVendorRow {
  id: string;
  name: string | null;
}

interface SignedImageRow {
  id: string;
  sort_order: number;
  created_at: string;
  signedUrl: string;
}

type PlaceSummaryRow = { id: string; name: string; level: string };
type TranslationSummaryRow = {
  id: string;
  field: 'name' | 'description';
  locale: 'zh-CN' | 'ms';
  source_text: string;
  translated_text: string;
  status: 'draft' | 'approved' | 'rejected' | 'stale';
};

function relationName(relation: RecommendationDetailRow['categories']) {
  if (Array.isArray(relation)) return relation[0]?.name ?? null;
  return relation?.name ?? null;
}

export function buildAdminRecommendationDetail(input: {
  recommendation: RecommendationDetailRow;
  recommender: UserSummaryRow | null;
  reviewer: UserSummaryRow | null;
  convertedVendor: ConvertedVendorRow | null;
  images: SignedImageRow[];
  suggestedPlace?: PlaceSummaryRow | null;
  resolvedPlace?: PlaceSummaryRow | null;
  translations?: TranslationSummaryRow[];
  assignment?: {
    assignedTo: string | null;
    claimedAt: string | null;
    isAssignedToActor: boolean;
    canDecide: boolean;
  };
  availableActions?: Array<'approve' | 'request_changes' | 'reject'>;
  reviewEvents?: Array<{
    id: string;
    from_status: string;
    to_status: string;
    action: 'approve' | 'request_changes' | 'reject';
    actor_id: string | null;
    actor_role: string;
    internal_note: string | null;
    customer_message: string;
    created_at: string;
    actor_name: string | null;
  }>;
}): AdminRecommendationDetail {
  const { recommendation: row } = input;
  const hasLocation = Boolean(
    row.google_place_id
    || row.location_name
    || row.formatted_address
    || row.vendor_address
    || row.latitude != null
    || row.longitude != null,
  );
  const hasReview = Boolean(
    row.reviewer_id
    || row.reviewed_at
    || row.rejection_reason
    || row.changes_requested_at
    || row.changes_requested_reason,
  );

  return {
    id: row.id,
    name: row.vendor_name,
    description: row.description,
    whyRecommend: row.why_recommend,
    category: relationName(row.categories),
    state: row.state,
    location: hasLocation ? {
      placeId: row.google_place_id,
      name: row.location_name,
      address: row.formatted_address ?? row.vendor_address,
      latitude: row.latitude,
      longitude: row.longitude,
    } : null,
    contact: {
      phone: row.contact_phone,
      email: row.contact_email,
      website: row.contact_website,
    },
    images: input.images.map((image) => ({
      id: image.id,
      url: image.signedUrl,
      sortOrder: image.sort_order,
      createdAt: image.created_at,
    })),
    author: {
      id: row.recommender_id,
      name: input.recommender?.full_name ?? 'MyWisata member',
      email: input.recommender?.email ?? null,
      isKycVerified: input.recommender?.kyc_status === 'approved',
    },
    submittedAt: row.created_at,
    imageAttestedAt: row.image_attested_at,
    status: row.status,
    assignment: input.assignment ?? {
      assignedTo: row.assigned_to ?? null,
      claimedAt: row.claimed_at ?? null,
      isAssignedToActor: false,
      canDecide: false,
    },
    availableActions: input.availableActions ?? (input.assignment?.canDecide
      ? ['approve', 'request_changes', 'reject']
      : []),
    reviewEvents: (input.reviewEvents ?? []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      action: event.action,
      actor: { id: event.actor_id, name: event.actor_name ?? 'Admin' },
      actorRole: event.actor_role,
      internalNote: event.internal_note,
      customerMessage: event.customer_message,
      createdAt: event.created_at,
    })),
    review: hasReview ? {
      reviewer: input.reviewer ? {
        id: input.reviewer.id,
        name: input.reviewer.full_name ?? 'Admin',
        email: input.reviewer.email,
      } : null,
      reviewedAt: row.reviewed_at,
      reason: row.status === 'changes_requested'
        ? row.changes_requested_reason
        : row.rejection_reason,
      changesRequestedAt: row.changes_requested_at,
    } : null,
    conversion: row.converted_vendor_id ? {
      vendorId: row.converted_vendor_id,
      vendorName: input.convertedVendor?.name ?? null,
    } : null,
    localization: {
      suggestedPlace: input.suggestedPlace ?? null,
      resolvedPlace: input.resolvedPlace ?? null,
      translations: (input.translations ?? []).map((translation) => ({
        id: translation.id,
        field: translation.field,
        locale: translation.locale,
        sourceText: translation.source_text,
        translatedText: translation.translated_text,
        status: translation.status,
      })),
    },
  };
}
