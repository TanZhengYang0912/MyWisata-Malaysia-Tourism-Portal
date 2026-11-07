import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { recommendationResubmissionSchema } from '@/lib/recommendations/submission';
import { CUSTOMER_CAPABILITY } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';
import { reserveGuestRateLimit } from '@/lib/checkout/guest-session';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecommendationRow = {
  id: string;
  recommender_id: string;
  vendor_name: string;
  description: string | null;
  why_recommend: string | null;
  status: string;
  state: string | null;
  created_at: string;
  reviewed_at: string | null;
  changes_requested_at: string | null;
  changes_requested_reason: string | null;
  rejection_reason: string | null;
  converted_vendor_id: string | null;
  categories: { name: string } | Array<{ name: string }> | null;
  updated_at: string;
  category_id: string | null;
  google_place_id: string | null;
  location_name: string | null;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
};

function categoryName(value: RecommendationRow['categories']) {
  return Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await db
    .from('vendor_recommendations')
    .select('id,recommender_id,vendor_name,description,why_recommend,status,state,created_at,updated_at,reviewed_at,changes_requested_at,changes_requested_reason,rejection_reason,converted_vendor_id,category_id,google_place_id,location_name,formatted_address,latitude,longitude,contact_phone,contact_email,contact_website,categories(name)')
    .eq('id', id)
    .eq('recommender_id', user.id)
    .maybeSingle();
  if (error || !data) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  const recommendation = data as unknown as RecommendationRow;
  const service = createServiceClient();
  const { data: reviewEvents, error: eventError } = await service
    .from('recommendation_review_events')
    .select('id,from_status,to_status,action,customer_message,created_at')
    .eq('recommendation_id', id)
    .order('created_at', { ascending: true });
  if (eventError) return apiFail('TIMELINE_UNAVAILABLE', 'Unable to load recommendation timeline', 500);

  const vendorResult = recommendation.converted_vendor_id
    ? await service
      .from('vendors')
      .select('id,name')
      .eq('id', recommendation.converted_vendor_id)
      .maybeSingle()
    : { data: null, error: null };
  if (vendorResult.error) return apiFail('VENDOR_UNAVAILABLE', 'Unable to load linked vendor', 500);

  const events = (reviewEvents ?? []).map((event) => ({
    id: event.id,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    action: event.action,
    message: event.customer_message,
    createdAt: event.created_at,
  }));
  const latestMessage = events.at(-1)?.message ?? null;

  const images = recommendation.status === 'changes_requested'
    ? await service.from('recommendation_images').select('id').eq('recommendation_id', id).eq('owner_id', user.id)
      .eq('is_staged', false).is('removed_at', null).order('sort_order', { ascending: true }).limit(5)
    : { data: [], error: null };
  if (images.error) return apiFail('IMAGES_UNAVAILABLE', 'Unable to load recommendation photos', 503);

  return apiOk({
    id: recommendation.id,
    name: recommendation.vendor_name,
    description: recommendation.description,
    whyRecommend: recommendation.why_recommend,
    category: categoryName(recommendation.categories),
    state: recommendation.state,
    status: recommendation.status,
    submittedAt: recommendation.created_at,
    reviewedAt: recommendation.reviewed_at,
    changesRequested: recommendation.status === 'changes_requested' ? {
      message: recommendation.changes_requested_reason ?? latestMessage,
      createdAt: recommendation.changes_requested_at ?? recommendation.reviewed_at,
    } : null,
    decision: recommendation.status === 'approved' || recommendation.status === 'rejected' ? {
      message: latestMessage ?? recommendation.rejection_reason,
      createdAt: recommendation.reviewed_at,
    } : null,
    vendor: vendorResult.data ? {
      id: vendorResult.data.id,
      name: vendorResult.data.name,
      href: `/customer/vendors/${vendorResult.data.id}`,
    } : null,
    events,
    editable: recommendation.status === 'changes_requested' ? {
      version: recommendation.updated_at,
      categoryId: recommendation.category_id,
      location: { placeId: recommendation.google_place_id, name: recommendation.location_name ?? '', formattedAddress: recommendation.formatted_address ?? '', latitude: recommendation.latitude, longitude: recommendation.longitude },
      contact: { phone: recommendation.contact_phone, email: recommendation.contact_email, website: recommendation.contact_website },
      images: (images.data ?? []).map((image) => ({ id: image.id, url: `/api/recommendations/images?imageId=${encodeURIComponent(image.id)}` })),
    } : null,
    nextAction: recommendation.status === 'changes_requested'
      ? 'update_recommendation'
      : recommendation.status === 'converted'
      ? 'view_vendor'
      : null,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const decision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT);
  const failure = customerCapabilityFailure(CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT, decision, "Complete your profile or verification before submitting");
  if (failure) return failure;
  if (!await reserveGuestRateLimit(`recommendation-resubmit:${user.id}`, 10, 600)) return apiFail('RATE_LIMITED', 'Please try again later', 429);
  const parsed = await parseBody(request, recommendationResubmissionSchema, { maxBytes: 32_768 });
  if (!parsed.ok) return parsed.response;
  const { expectedVersion, retainedImageIds, stagedImageIds, ...value } = parsed.data;
  const { data, error } = await db.rpc('resubmit_recommendation', {
    p_id: id, p_expected_updated_at: expectedVersion, p_data: value,
    p_retained_image_ids: retainedImageIds, p_staged_image_ids: stagedImageIds,
  });
  if (error) {
    if (error.message.includes('recommendation_not_found')) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
    if (/recommendation_changed|recommendation_not_editable|duplicate/.test(error.message)) return apiFail('CONFLICT', 'The recommendation changed. Reload it before resubmitting.', 409);
    if (error.message.includes('rate_limited')) return apiFail('RATE_LIMITED', 'Daily recommendation update limit reached', 429);
    if (/invalid|profile_or_kyc_required/.test(error.message)) return apiFail('INVALID_RECOMMENDATION', 'Check the recommendation details and photos', 422);
    return apiFail('UPDATE_UNAVAILABLE', 'Unable to update the recommendation', 503);
  }
  return apiOk(data);
}
