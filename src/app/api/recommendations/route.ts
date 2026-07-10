// P-TMF — Customer submits vendor recommendation + gets quality score
// POST /api/recommendations
//   Body: { vendorName, vendorAddress?, description, categoryId? }
//   Auth: KYC-verified user
//   Rate-limited: 5 submissions per user per 7 days (duplicate flag)

import { createClient } from '@/lib/supabase/server';
import { recommendationSubmitSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { recordAudit } from '@/lib/audit';
import {
  recommendationQualityScore,
  isDuplicateSubmission,
} from '@/lib/scoring/recommendation-quality';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const parsed = await parseBody(request, recommendationSubmitSchema);
  if (!parsed.ok) return parsed.response;

  // Gate: profile must be at least complete (kyc_status = pending or approved)
  const { data: profile } = await supabase
    .from('users')
    .select('kyc_status, profile_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile?.profile_completed_at) {
    return apiFail('PROFILE_INCOMPLETE', 'Complete your profile before recommending', 403);
  }

  const idem = await withIdempotency(request, user.id, '/api/recommendations', parsed.data);
  if (idem.replayed) return idem.replayed;

  // Rate limit: duplicate flag
  const dupCheck = await isDuplicateSubmission(user.id, parsed.data.vendorName, supabase);
  if (dupCheck.isDuplicate) {
    return apiFail(
      'RATE_LIMITED',
      `You have ${dupCheck.count} similar recent submissions — please diversify`,
      429,
      { similarCount: dupCheck.count },
    );
  }

  const { data: rec, error } = await supabase
    .from('vendor_recommendations')
    .insert({
      recommender_id: user.id,
      vendor_name:    parsed.data.vendorName,
      vendor_address: parsed.data.vendorAddress ?? null,
      description:    parsed.data.description,
      category_id:    parsed.data.categoryId ?? null,
      status:         'pending',
    })
    .select('*')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Compute quality score AFTER insert so `id` is available for duplicate query
  const quality = await recommendationQualityScore(rec, supabase);

  await recordAudit({
    actorId:    user.id,
    action:     'recommendation.submitted',
    entityType: 'vendor_recommendation',
    entityId:   rec.id,
    afterData:  { vendor_name: rec.vendor_name, quality_score: quality.score },
  });

  return idem.record(
    { data: { recommendation: rec, quality }, error: null },
    201,
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const url    = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);

  let query = supabase
    .from('vendor_recommendations')
    .select('*')
    .eq('recommender_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return Response.json({ data, error: null });
}
