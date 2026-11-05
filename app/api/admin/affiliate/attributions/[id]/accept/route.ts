// P4 — Member 4: admin per-attribution review — manual "Accept" on a single
// pending commission (/admin/affiliate's "All attributions" table).
// Gated on super_admin, checked server-side, matching every other
// admin route in this module.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { acceptAttribution } from '@/lib/affiliate/clearing';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can review commissions', 403);
  }

  const service = createServiceClient();
  const result = await acceptAttribution(service, id);
  if (result.outcome === 'error') {
    return apiFail(
      'CLEARING_RESULT_UNCERTAIN',
      'We could not confirm this commission status. Refresh the attribution list first. If the result is still unclear, contact support with the Request ID before taking another action.',
      503,
    );
  }
  if (result.outcome === 'review_required') return apiFail('INVALID_STATE', 'Resolve the guest commission review first', 409);
  if (result.outcome === 'order_review_required') {
    const noShowPolicy = result.reason === 'no_show_policy';
    return apiFail(
      noShowPolicy ? 'AFFILIATE_NO_SHOW_POLICY_REVIEW' : 'AFFILIATE_ORDER_REVIEW_REQUIRED',
      noShowPolicy
        ? 'This commission remains pending because no Affiliate rule is approved for a verified customer no-show.'
        : 'This order needs fulfilment or refund review. Resolve it in Reconciliation, then refresh before accepting.',
      409,
    );
  }

  return apiOk(result);
}
