// P4 — Member 4: fraud detection sweep (CLAUDE-PHASE2.md Feature C)
// POST /api/admin/affiliate/fraud-sweep — scans every affiliate link for
// click-velocity, visitor-clustering, and zero-conversion patterns. Gated
// on super_admin, checked server-side. This is the manual "Run
// fraud sweep" button; it also runs automatically inside the clearing job
// (lib/affiliate/clearing.ts).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { runFraudSweep } from '@/lib/affiliate/fraud';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can run a fraud sweep', 403);
  }

  const service = createServiceClient();
  const result = await runFraudSweep(service);
  return apiOk(result);
}
