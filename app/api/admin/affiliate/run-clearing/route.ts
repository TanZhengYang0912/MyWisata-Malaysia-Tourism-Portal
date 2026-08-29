// P4 — Member 4: commission clearing (CLAUDE-PHASE2.md Feature D)
// POST /api/admin/affiliate/run-clearing — clears matured pending
// commissions into the real wallet. Gated on super_admin/approver, checked
// server-side. In production this is the job a daily cron would call; this
// route is the manual "Run clearing" button for the demo.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can run commission clearing', 403);
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('confirm_pending_earnings');
  if (error) {
    return apiFail('CLEARING_FAILED', 'Unable to clear matured commissions', 500);
  }

  return apiOk({ confirmed: Number(data ?? 0) });
}
