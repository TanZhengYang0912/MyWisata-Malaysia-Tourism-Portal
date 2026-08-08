import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { auditAndNotify } from '@/lib/audit';
import { enqueueRecommendationApprovalEmail } from '@/lib/email/events';

const reviewSchema = z.object({
  recommendationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  action:           z.enum(['approve', 'reject', 'request_changes']),
  reason:           z.string().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const { recommendationId, action, reason } = parsed.data;
  if (['reject', 'request_changes'].includes(action) && (!reason || reason.trim().length < 10)) {
    return apiFail('REASON_REQUIRED', 'Explain the decision in at least 10 characters', 422);
  }

  // Fetch submitter before the update (for notification)
  const { data: rec } = await supabase
    .from('vendor_recommendations')
    .select('recommender_id, vendor_name, status')
    .eq('id', recommendationId)
    .maybeSingle();

  if (!rec) return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  // Atomic: update status + reviewer + reviewed_at
  const { error: rpcErr } = await supabase.rpc('admin_review_recommendation', {
    p_rec_id: recommendationId,
    p_action: action,
    p_reason: reason ?? null,
  });

  if (rpcErr) {
    if (rpcErr.message.includes('admin_required')) return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (rpcErr.message.includes('self_dealing'))   return apiFail('FORBIDDEN', 'You cannot review your own recommendation', 403);
    if (rpcErr.message.includes('not_found_or_already_reviewed')) {
      return apiFail('CONFLICT', 'Recommendation already reviewed or not found', 409);
    }
    return apiFail('RPC_ERROR', rpcErr.message, 500);
  }

  const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';

  await auditAndNotify(
    {
      action:     `recommendation.${action}`,
      entityType: 'vendor_recommendation',
      entityId:   recommendationId,
      beforeData: { status: rec.status },
      afterData:  { status: newStatus },
      note:       reason,
    },
    [{
      userId: rec.recommender_id,
      type:   action === 'request_changes' ? 'recommendation_changes_requested' : `recommendation_${action}d`,
      title:  action === 'request_changes' ? `Changes requested for "${rec.vendor_name}"` : `Your recommendation "${rec.vendor_name}" was ${newStatus}`,
      body:   action === 'approve'
        ? 'Great find! We will reach out to the vendor soon.'
        : (reason ?? 'Please check the submission guidelines and try again.'),
      link:   '/customer/recommendations',
    }],
  );

  if (action === 'approve') {
    try {
      await enqueueRecommendationApprovalEmail({
        recommendationId,
        userId: rec.recommender_id,
        vendorName: rec.vendor_name,
      });
    } catch (error) {
      console.error('[recommendation-review] approval email enqueue failed', error);
    }
  }

  return apiOk({ recommendationId, status: newStatus });
}
