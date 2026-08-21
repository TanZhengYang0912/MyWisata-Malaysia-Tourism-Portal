// P4 — Member 4: admin per-attribution review — manual "Accept" on a single
// pending commission (/admin/affiliate's "All attributions" table).
// Gated on super_admin/approver, checked server-side, matching every other
// admin route in this module.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { acceptAttribution } from '@/lib/affiliate/clearing';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can review commissions', 403);
  }

  const service = createServiceClient();
  const result = await acceptAttribution(service, id);
  if (result.outcome === 'error') return apiFail('DB_ERROR', result.error ?? 'Could not accept this commission', 500);

  return apiOk(result);
}
