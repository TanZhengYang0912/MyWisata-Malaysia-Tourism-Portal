// P-TMF — Admin approves/rejects a vendor recommendation
// POST /api/admin/recommendations/[id]/review
//   Body: { action: 'approve'|'reject', reason? }

import { createClient } from '@/lib/supabase/server';
import { recommendationReviewSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { auditAndNotify } from '@/lib/audit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: recId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin only', 403);

  const parsed = await parseBody(request, recommendationReviewSchema);
  if (!parsed.ok) return parsed.response;

  const idem = await withIdempotency(
    request, user.id, `/api/admin/recommendations/${recId}/review`, parsed.data,
  );
  if (idem.replayed) return idem.replayed;

  const { data: rec } = await supabase
    .from('vendor_recommendations')
    .select('*')
    .eq('id', recId)
    .single();

  if (!rec) return apiFail('NOT_FOUND', '', 404);
  if (rec.status !== 'pending') {
    return apiFail('INVALID_STATE', `Recommendation is ${rec.status}, cannot review`, 409);
  }

  const newStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected';

  const { error } = await supabase
    .from('vendor_recommendations')
    .update({
      status:           newStatus,
      reviewer_id:      user.id,
      reviewed_at:      new Date().toISOString(),
      rejection_reason: parsed.data.action === 'reject' ? (parsed.data.reason ?? null) : null,
    })
    .eq('id', recId)
    .eq('status', 'pending');   // optimistic lock

  if (error) return apiFail('DB_ERROR', error.message, 500);

  await auditAndNotify(
    {
      actorId:    user.id,
      action:     `recommendation.${parsed.data.action}d`,
      entityType: 'vendor_recommendation',
      entityId:   recId,
      beforeData: { status: 'pending' },
      afterData:  { status: newStatus },
      note:       parsed.data.reason,
    },
    [{
      userId: rec.recommender_id,
      type:   parsed.data.action === 'approve' ? 'recommendation_approved' : 'recommendation_rejected',
      title:  parsed.data.action === 'approve'
        ? `Your recommendation "${rec.vendor_name}" was approved!`
        : `Your recommendation "${rec.vendor_name}" was rejected`,
      body:   parsed.data.reason,
      link:   '/profile',
    }],
  );

  return idem.record({ data: { status: newStatus }, error: null });
}
