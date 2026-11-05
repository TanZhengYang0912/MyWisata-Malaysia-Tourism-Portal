import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { RECOMMENDATION_STATUSES } from '@/lib/customer/recommendation-status';
import { recommendationSubmissionSchema } from '@/lib/recommendations/submission';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

async function storeSuggestedPlace(recommendationId: string, latitude: number, longitude: number) {
  try {
    const service = createServiceClient();
    const { data: placeId, error } = await service.rpc('nearest_recommendation_place', { p_lat: latitude, p_lng: longitude });
    if (error) throw error;
    if (!placeId) return;
    const { error: updateError } = await service
      .from('vendor_recommendations')
      .update({ suggested_place_id: placeId, place_resolution_status: 'suggested' })
      .eq('id', recommendationId);
    if (updateError) throw updateError;
  } catch (error) {
    console.warn('[recommendations] place suggestion failed', error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT),
    'Sign in before submitting a recommendation',
  )!;

  const recommendationDecision = await resolveServerCustomerCapability(
    user.id,
    CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT,
  );
  const recommendationFailure = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT,
    recommendationDecision,
    'Verify your email and phone and complete your Profile before submitting a recommendation',
  );
  if (recommendationFailure) return recommendationFailure;

  const evidence = await parseBody(request, recommendationSubmissionSchema, { maxBytes: 32_768 });
  if (!evidence.ok) return evidence.response;
  const value = evidence.data;
  const { data, error } = await supabase.rpc('submit_recommendation_with_evidence', {
    p_vendor_name: value.vendorName,
    p_description: value.description,
    p_why_recommend: value.whyRecommend,
    p_category_id: value.categoryId ?? null,
    p_google_place_id: value.location.placeId ?? null,
    p_location_name: value.location.name,
    p_formatted_address: value.location.formattedAddress,
    p_latitude: value.location.latitude,
    p_longitude: value.location.longitude,
    p_contact_phone: value.contact.phone ?? null,
    p_contact_email: value.contact.email ?? null,
    p_contact_website: value.contact.website ?? null,
    p_image_ids: value.stagedImageIds,
  });

  if (error) {
    if (error.message.includes('verification_requirements_required')) {
      return apiFail(
        'VERIFICATION_REQUIRED',
        'Verify your email and phone and complete your Profile before submitting a recommendation',
        403,
      );
    }
    if (error.message.includes('rate_limited'))
      return apiFail('RATE_LIMITED', 'Daily recommendation limit reached — try again tomorrow', 429);
    if (error.message.includes('duplicate'))
      return apiFail('DUPLICATE', 'You already recommended a vendor with this name', 409);
    console.error('[recommendations] submission failed', { message: error.message, userId: user.id });
    return apiFail('RECOMMENDATION_FAILED', 'We could not submit your recommendation. Please try again.', 500);
  }

  await storeSuggestedPlace(data, value.location.latitude, value.location.longitude);

  return apiOk({ id: data, vendor_name: value.vendorName, status: 'pending' }, { status: 201 });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const params = new URL(request.url).searchParams;
  const rawPage = params.get('page') ?? '1';
  const status = params.get('status') ?? 'all';
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage)) || Number(rawPage) < 1 || Number(rawPage) > 10_000
      || !['all', ...RECOMMENDATION_STATUSES].includes(status)) {
    return apiFail('INVALID_FILTERS', 'Invalid recommendation filters', 422);
  }
  const page = Number(rawPage), pageSize = 25;
  let query = supabase
    .from('vendor_recommendations')
    .select('id, vendor_name, status, state, recommender_id, categories(name,slug), created_at', { count: 'exact' })
    .eq('recommender_id', user.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((row) => row.recommender_id))];
  const { data: authors, error: authorError } = authorIds.length > 0
    ? await supabase
      .from('public_users')
      .select('id,full_name,display_name,avatar_url,city,country,is_verified_contributor')
      .in('id', authorIds)
    : { data: [], error: null };
  if (authorError) return apiFail('DB_ERROR', authorError.message, 500);
  const authorById = new Map((authors ?? []).map((author) => [author.id, {
    id: author.id,
    name: author.display_name?.trim() || author.full_name?.trim() || 'MYLawatan member',
    avatarUrl: author.avatar_url ?? null,
    city: author.city ?? null,
    country: author.country ?? null,
    isVerifiedContributor: Boolean(author.is_verified_contributor),
  }]));
  return apiOk({ items: rows.map((row) => ({ ...row, author: authorById.get(row.recommender_id) ?? null })),
    page, pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) });
}
