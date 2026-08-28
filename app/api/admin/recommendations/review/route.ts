import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { enqueueRecommendationApprovalEmail } from '@/lib/email/events';

const reviewSchema = z.object({
  recommendationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  action:           z.enum(['approve', 'reject', 'request_changes']),
  internalNote:     z.string().max(1000).optional(),
  customerMessage:  z.string().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canReview, error: capabilityError } = await supabase.rpc('can_review_recommendation', {
    uid: user.id,
  });
  if (capabilityError || canReview !== true) {
    return apiFail('FORBIDDEN', 'Recommendation reviewer role required', 403);
  }

  const parsed = await parseBody(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const { recommendationId, action, internalNote, customerMessage } = parsed.data;
  if (['reject', 'request_changes'].includes(action)
    && (!customerMessage || customerMessage.trim().length < 10)) {
    return apiFail('CUSTOMER_MESSAGE_REQUIRED', 'Explain the decision to the customer in at least 10 characters', 422);
  }

  const { data: decision, error: rpcErr } = await supabase.rpc('admin_review_recommendation', {
    p_rec_id: recommendationId,
    p_action: action,
    p_internal_note: internalNote?.trim() || null,
    p_customer_message: customerMessage?.trim() || null,
  });

  if (rpcErr) {
    if (rpcErr.message.includes('admin_required')) return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (rpcErr.message.includes('self_dealing'))   return apiFail('FORBIDDEN', 'You cannot review your own recommendation', 403);
    if (rpcErr.message.includes('recommendation_not_assigned')) {
      return apiFail('CONFLICT', 'Recommendation is assigned to another reviewer', 409);
    }
    if (rpcErr.message.includes('customer_message_required')) {
      return apiFail('CUSTOMER_MESSAGE_REQUIRED', 'Explain the decision to the customer in at least 10 characters', 422);
    }
    if (rpcErr.message.includes('not_found_or_already_reviewed')) {
      return apiFail('CONFLICT', 'Recommendation already reviewed or not found', 409);
    }
    console.error('[recommendation-review] decision RPC failed', { message: rpcErr.message });
    return apiFail('RPC_ERROR', 'Unable to record recommendation decision', 500);
  }

  const result = decision as {
    recommendationId: string;
    status: string;
    recommenderId: string;
    vendorName: string;
  } | null;
  if (!result) return apiFail('RPC_ERROR', 'Review decision returned no result', 500);

  if (action === 'approve') {
    try {
      await enqueueRecommendationApprovalEmail({
        recommendationId,
        userId: result.recommenderId,
        vendorName: result.vendorName,
      });
    } catch (error) {
      console.error('[recommendation-review] approval email enqueue failed', error);
    }
  }

  return apiOk({ recommendationId, status: result.status });
}
