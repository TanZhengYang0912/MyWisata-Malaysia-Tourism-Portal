import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    .select('id,recommender_id,vendor_name,description,why_recommend,status,state,created_at,reviewed_at,changes_requested_at,changes_requested_reason,rejection_reason,converted_vendor_id,categories(name)')
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
      href: `/customer/vendor/${vendorResult.data.id}`,
    } : null,
    events,
    nextAction: recommendation.status === 'changes_requested'
      ? 'update_recommendation'
      : recommendation.status === 'converted'
      ? 'view_vendor'
      : null,
  });
}
