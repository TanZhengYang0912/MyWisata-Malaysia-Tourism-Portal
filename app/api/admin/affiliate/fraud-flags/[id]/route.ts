// P4 — Member 4: fraud flag review (CLAUDE-PHASE2.md Feature C)
// PATCH /api/admin/affiliate/fraud-flags/[id] — body { action: 'dismiss' | 'confirm' }
// Gated on super_admin/approver, checked server-side.
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
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { autoDisableLink } from '@/lib/affiliate/fraud';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can review fraud flags', 403);
  }

  const parsed = await parseBody(request, reviewFraudFlagSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: flag } = await service
    .from('affiliate_fraud_flags')
    .select('id, link_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!flag) return apiFail('NOT_FOUND', 'Fraud flag not found', 404);

  const newStatus = parsed.data.action === 'dismiss' ? 'dismissed' : 'reviewed';
  const { data, error } = await service
    .from('affiliate_fraud_flags')
    .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  if (parsed.data.action === 'confirm' && flag.link_id) {
    await autoDisableLink(service, flag.link_id, `admin confirmed fraud flag ${id}`, user.id);
  }

  return apiOk(data);
}
