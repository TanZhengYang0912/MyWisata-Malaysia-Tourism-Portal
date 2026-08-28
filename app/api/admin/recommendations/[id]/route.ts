import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildAdminRecommendationDetail,
  type RecommendationDetailRow,
} from '@/lib/recommendations/admin-detail';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canReview, error: roleError } = await db.rpc('can_review_recommendation', { uid: user.id });
  if (roleError || canReview !== true) return apiFail('FORBIDDEN', 'Recommendation reviewer role required', 403);
  const { data: isSuperAdmin } = await db.rpc('is_super_admin', { uid: user.id });
  const { data: assignmentData, error: assignmentError } = await db.rpc('claim_recommendation_review', {
    p_recommendation_id: id,
  });
  if (assignmentError) {
    if (assignmentError.message.includes('recommendation_not_found')) {
      return apiFail('NOT_FOUND', 'Recommendation not found', 404);
    }
    return apiFail('ASSIGNMENT_FAILED', 'Unable to claim recommendation review', 409);
  }
  const assignment = assignmentData as {
    assignedTo: string | null;
    claimedAt: string | null;
    isAssignedToActor: boolean;
    canDecide: boolean;
  };

  const service = createServiceClient();
  const { data: recommendation, error: recommendationError } = await service
    .from('vendor_recommendations')
    .select(`
      id, recommender_id, vendor_name, description, why_recommend,
      category_id, state, vendor_address, google_place_id, location_name,
      formatted_address, latitude, longitude, contact_phone, contact_email,
      contact_website, image_attested_at, status, reviewer_id, reviewed_at,
      rejection_reason, changes_requested_at, changes_requested_reason,
      converted_vendor_id, suggested_place_id, resolved_place_id,
      assigned_to, claimed_at, created_at, categories(name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (recommendationError || !recommendation) {
    return apiFail('NOT_FOUND', 'Recommendation not found', 404);
  }

  const row = recommendation as unknown as RecommendationDetailRow;
  const userIds = [row.recommender_id, row.reviewer_id, row.assigned_to].filter(
    (value): value is string => Boolean(value),
  );
  const placeIds = isSuperAdmin ? [row.suggested_place_id, row.resolved_place_id].filter(
    (value): value is string => Boolean(value),
  ) : [];

  const [
    { data: users },
    { data: imageRows },
    convertedVendorResult,
    { data: places },
    { data: translations },
    { data: reviewEventRows, error: reviewEventsError },
  ] = await Promise.all([
    userIds.length > 0
      ? service.from('users').select('id,full_name,email,kyc_status').in('id', userIds)
      : Promise.resolve({ data: [] }),
    service
      .from('recommendation_images')
      .select('id,storage_path,sort_order,created_at')
      .eq('recommendation_id', id)
      .eq('is_staged', false)
      .is('removed_at', null)
      .order('sort_order', { ascending: true }),
    row.converted_vendor_id
      ? service.from('vendors').select('id,name').eq('id', row.converted_vendor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    placeIds.length > 0
      ? service.from('places').select('id,name,level').in('id', placeIds)
      : Promise.resolve({ data: [] }),
    isSuperAdmin
      ? service
      .from('content_translations')
      .select('id,field,locale,source_text,translated_text,status')
      .eq('entity_type', 'vendor_recommendation')
      .eq('entity_id', id)
      .in('field', ['name', 'description'])
      .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    service
      .from('recommendation_review_events')
      .select(`
        id, from_status, to_status, action, actor_id, actor_role,
        internal_note, customer_message, created_at,
        users!recommendation_review_events_actor_id_fkey(full_name)
      `)
      .eq('recommendation_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (reviewEventsError) {
    console.error('[admin-recommendation-detail] review evidence unavailable', { recommendationId: id });
    return apiFail('EVIDENCE_FAILED', 'Unable to load recommendation review evidence', 500);
  }

  const signedImages = await Promise.all(
    ((imageRows ?? []) as Array<{
      id: string;
      storage_path: string;
      sort_order: number;
      created_at: string;
    }>).map(async (image) => {
      const { data } = await service.storage
        .from('recommendation-images')
        .createSignedUrl(image.storage_path, 600);
      return data?.signedUrl ? {
        id: image.id,
        sort_order: image.sort_order,
        created_at: image.created_at,
        signedUrl: data.signedUrl,
      } : null;
    }),
  );

  const userRows = (users ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    kyc_status: string | null;
  }>;
  const reviewEvents = ((reviewEventRows ?? []) as unknown as Array<{
    id: string;
    from_status: string;
    to_status: string;
    action: 'approve' | 'request_changes' | 'reject';
    actor_id: string | null;
    actor_role: string;
    internal_note: string | null;
    customer_message: string;
    created_at: string;
    users: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  }>).map((event) => {
    const actor = Array.isArray(event.users) ? event.users[0] : event.users;
    return {
      ...event,
      actor_name: actor?.full_name ?? null,
    };
  });
  const availableActions: Array<'approve' | 'request_changes' | 'reject'> = assignment.canDecide
    ? ['approve', 'request_changes', 'reject']
    : [];

  return apiOk(buildAdminRecommendationDetail({
    recommendation: row,
    recommender: userRows.find((entry) => entry.id === row.recommender_id) ?? null,
    reviewer: userRows.find((entry) => entry.id === row.reviewer_id) ?? null,
    convertedVendor: convertedVendorResult.data as { id: string; name: string | null } | null,
    images: signedImages.filter((image): image is NonNullable<typeof image> => image != null),
    suggestedPlace: (places ?? []).find((place) => place.id === row.suggested_place_id) as { id: string; name: string; level: string } | null,
    resolvedPlace: (places ?? []).find((place) => place.id === row.resolved_place_id) as { id: string; name: string; level: string } | null,
    translations: (translations ?? []) as Array<{
      id: string;
      field: 'name' | 'description';
      locale: 'zh-CN' | 'ms';
      source_text: string;
      translated_text: string;
      status: 'draft' | 'approved' | 'rejected' | 'stale';
    }>,
    assignment,
    availableActions,
    reviewEvents,
  }));
}
