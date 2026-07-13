import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { auditAndNotify } from '@/lib/audit';

const linkSchema = z.object({
  vendorId:         z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  recommendationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, linkSchema);
  if (!parsed.ok) return parsed.response;
  const { vendorId, recommendationId } = parsed.data;

  // Fetch names for audit before the update
  const [{ data: vendor }, { data: rec }] = await Promise.all([
    supabase.from('vendors').select('name').eq('id', vendorId).maybeSingle(),
    supabase.from('vendor_recommendations').select('vendor_name, recommender_id').eq('id', recommendationId).maybeSingle(),
  ]);

  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (!rec)    return apiFail('NOT_FOUND', 'Recommendation not found', 404);

  // Atomic: advance recommendation to 'converted' + create recommendation_conversions row
  const { data: conversionId, error: rpcErr } = await supabase.rpc('admin_link_vendor_recommendation', {
    p_vendor_id: vendorId,
    p_rec_id:    recommendationId,
  });

  if (rpcErr) {
    if (rpcErr.message.includes('admin_required'))  return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (rpcErr.message.includes('self_dealing'))    return apiFail('FORBIDDEN', 'You cannot link a recommendation you submitted', 403);
    if (rpcErr.message.includes('vendor_already_linked')) {
      return apiFail('CONFLICT', 'This vendor already has an active commission window. Wait for it to expire before linking again.', 409);
    }
    if (rpcErr.message.includes('recommendation_not_approved_or_not_found')) {
      return apiFail('INVALID_STATE', 'Recommendation must be in approved state before linking', 409);
    }
    return apiFail('RPC_ERROR', rpcErr.message, 500);
  }

  await auditAndNotify(
    {
      action:     'recommendation.converted',
      entityType: 'vendor_recommendation',
      entityId:   recommendationId,
      afterData:  { convertedVendorId: vendorId, conversionId },
    },
    [{
      userId: rec.recommender_id,
      type:   'recommendation_converted',
      title:  `"${rec.vendor_name}" has joined MyWisata!`,
      body:   `Your recommendation led to a new vendor. You will earn commission from their sales for 90 days.`,
      link:   '/customer/recommendations',
    }],
  );

  return apiOk({ conversionId, vendorId, recommendationId });
}
