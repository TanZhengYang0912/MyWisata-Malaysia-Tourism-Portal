// P-TMF — Admin mock-converts an approved recommendation
// POST /api/admin/recommendations/[id]/convert
//   Body: { vendorId, bonusAmount? }
//   Auth: admin
//   Transaction: convert_recommendation RPC does everything atomically
//     (conversion + recommendation.status + wallet_ledger + commission row)

import { createClient } from '@/lib/supabase/server';
import { recommendationConvertSchema, parseBody, apiFail } from '@/lib/validation/schemas';
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

  const parsed = await parseBody(request, recommendationConvertSchema);
  if (!parsed.ok) return parsed.response;

  const idem = await withIdempotency(
    request, user.id, `/api/admin/recommendations/${recId}/convert`, parsed.data,
  );
  if (idem.replayed) return idem.replayed;

  // Fetch recommender for notification
  const { data: rec } = await supabase
    .from('vendor_recommendations')
    .select('recommender_id, vendor_name, status')
    .eq('id', recId)
    .single();

  if (!rec) return apiFail('NOT_FOUND', '', 404);
  if (rec.status !== 'approved') {
    return apiFail('INVALID_STATE', `Must be approved before convert (is ${rec.status})`, 409);
  }

  // Verify vendorId exists (RPC does not check)
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('id', parsed.data.vendorId)
    .single();
  if (!vendor) return apiFail('VENDOR_NOT_FOUND', 'Target vendor does not exist', 404);

  // Atomic conversion
  const { data: result, error } = await supabase.rpc('convert_recommendation', {
    p_recommendation_id: recId,
    p_admin_id:          user.id,
    p_vendor_id:         parsed.data.vendorId,
    p_bonus_amount:      parsed.data.bonusAmount,
  });

  if (error) return apiFail('RPC_ERROR', error.message, 500);

  await auditAndNotify(
    {
      actorId:    user.id,
      action:     'recommendation.converted',
      entityType: 'vendor_recommendation',
      entityId:   recId,
      afterData:  result,
    },
    [{
      userId: rec.recommender_id,
      type:   'recommendation_converted',
      title:  `Your recommendation "${rec.vendor_name}" earned you RM ${parsed.data.bonusAmount.toFixed(2)}!`,
      body:   'The bonus is now in your pending balance and will clear in 7 days.',
      link:   '/wallet',
    }],
  );

  return idem.record({ data: result, error: null }, 201);
}
