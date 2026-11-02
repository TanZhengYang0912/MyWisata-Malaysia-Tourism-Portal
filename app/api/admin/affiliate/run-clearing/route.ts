// P4 — Member 4: commission clearing (CLAUDE-PHASE2.md Feature D)
// POST /api/admin/affiliate/run-clearing — clears matured pending
// commissions into the real wallet. Gated on super_admin, checked
// server-side. In production this is the job a daily cron would call; this
// route is the manual "Run clearing" button for the demo.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { clearMaturedCommissions } from '@/lib/affiliate/clearing';
import { createRequestId } from '@/lib/request-id';
import { log } from '@/lib/log';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can run commission clearing', 403);
  }

  const service = createServiceClient();
  try {
    const result = await clearMaturedCommissions(service);
    const errors = result.errors.map(({ attributionId, critical }) => {
      const requestId = createRequestId();
      log('error', 'affiliate_clearing_row_failed', { requestId, attributionId, critical: Boolean(critical) });
      return {
        attributionId,
        code: 'CLEARING_RESULT_UNCERTAIN',
        message: 'We could not confirm this commission status. Refresh the list before taking another action. Contact support with the Request ID if it remains unclear.',
        requestId,
        critical,
      };
    });
    return apiOk({ ...result, errors });
  } catch {
    return apiFail('CLEARING_FAILED', 'Unable to clear matured commissions', 500);
  }
}
