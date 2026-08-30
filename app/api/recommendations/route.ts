import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { recommendationSubmissionSchema } from '@/lib/recommendations/submission';
import { selectSuggestedPlace } from '@/lib/recommendations/place-resolution';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

async function storeSuggestedPlace(recommendationId: string, latitude: number, longitude: number) {
  try {
    const service = createServiceClient();
    const { data: places, error } = await service
      .from('places')
      .select('id,name,level,lat,lng')
      .eq('status', 'active');
    if (error) throw error;
    const suggestion = selectSuggestedPlace(latitude, longitude, (places ?? []).map((place) => ({
      id: place.id,
      name: place.name,
      level: place.level,
      latitude: Number(place.lat),
      longitude: Number(place.lng),
    })));
    if (!suggestion) return;
    const { error: updateError } = await service
      .from('vendor_recommendations')
      .update({ suggested_place_id: suggestion.id, place_resolution_status: 'suggested' })
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
    'Complete your Profile or receive KYC approval before submitting a recommendation',
  );
  if (recommendationFailure) return recommendationFailure;

  const body = await request.json().catch(() => null);
  const evidence = recommendationSubmissionSchema.safeParse(body);
  if (!evidence.success) return apiFail('VALIDATION_FAILED', 'Complete all required recommendation evidence', 422, evidence.error.flatten());
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
    if (error.message.includes('rate_limited'))
      return apiFail('RATE_LIMITED', 'Daily recommendation limit reached — try again tomorrow', 429);
    if (error.message.includes('duplicate'))
      return apiFail('DUPLICATE', 'You already recommended a vendor with this name', 409);
    return apiFail('DB_ERROR', error.message, 500);
  }

  await storeSuggestedPlace(data, value.location.latitude, value.location.longitude);

  return apiOk({ id: data, vendor_name: value.vendorName, status: 'pending' }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase
    .from('vendor_recommendations')
    .select('id, vendor_name, status, state, recommender_id, categories(name,slug), created_at')
    .eq('recommender_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return apiFail('DB_ERROR', error.message, 500);
  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((row) => row.recommender_id))];
  const { data: authors, error: authorError } = authorIds.length > 0
    ? await supabase
      .from('public_users')
      .select('id,full_name,display_name,avatar_url,city,country,is_kyc_verified')
      .in('id', authorIds)
    : { data: [], error: null };
  if (authorError) return apiFail('DB_ERROR', authorError.message, 500);
  const authorById = new Map((authors ?? []).map((author) => [author.id, {
    id: author.id,
    name: author.display_name?.trim() || author.full_name?.trim() || 'MyWisata member',
    avatarUrl: author.avatar_url ?? null,
    city: author.city ?? null,
    country: author.country ?? null,
    isKycVerified: Boolean(author.is_kyc_verified),
  }]));
  return apiOk(rows.map((row) => ({ ...row, author: authorById.get(row.recommender_id) ?? null })));
}
