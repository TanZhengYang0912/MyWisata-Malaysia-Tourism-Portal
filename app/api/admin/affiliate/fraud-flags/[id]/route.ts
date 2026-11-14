// P4 — Member 4: fraud flag review (CLAUDE-PHASE2.md Feature C)
// PATCH /api/admin/affiliate/fraud-flags/[id] — body { action: 'dismiss' | 'confirm' }
// Gated on super_admin, checked server-side.
//
// 'dismiss'  — false positive. status -> 'dismissed'. No effect on the link.
// 'confirm'  — status -> 'reviewed' AND the link is disabled (if not already),
//              regardless of the flag's own severity — this is the admin's
//              manual override for a flag the auto-disable (high severity
//              only, see lib/affiliate/fraud.ts) didn't already act on.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { reviewFraudFlagSchema } from '@/lib/validation/affiliate-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can review fraud flags', 403);
  }

  const parsed = await parseBody(request, reviewFraudFlagSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data, error } = await service.rpc('admin_review_affiliate_fraud_flag', {
    p_flag_id: id,
    p_actor_id: user.id,
    p_action: parsed.data.action,
  });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const result = Array.isArray(data) ? data[0] : null;
  if (!result) return apiFail('NOT_FOUND', 'Fraud flag not found', 404);
  return apiOk(result);
}
