// P4 — Member 4: admin per-attribution review — manual "Reject" on a single
// pending commission (/admin/affiliate's "All attributions" table).
// Gated on super_admin, checked server-side, matching every other
// admin route in this module.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { rejectAttributionSchema } from '@/lib/validation/affiliate-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { rejectAttribution } from '@/lib/affiliate/clearing';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can review commissions', 403);
  }

  const parsed = await parseBody(request, rejectAttributionSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const result = await rejectAttribution(service, id, user.id, parsed.data.reason);
  if (!result.rejected) return apiFail('INVALID_STATE', result.error ?? 'Could not reject this commission', 400);

  return apiOk({ id, status: 'rejected' });
}
