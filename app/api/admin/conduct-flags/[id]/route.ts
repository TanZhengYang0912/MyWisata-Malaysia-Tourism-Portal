// P4 — Member 4: mark a staff conduct flag reviewed. CLAUDE-ADMIN-CONDUCT.md.
// PATCH /api/admin/conduct-flags/[id] — no body. Super-admin only.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { reviewAdminConductFlag } from '@/lib/moderation/admin-conduct';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Staff conduct review is limited to super admins', 403);
  }

  const service = createServiceClient();
  let reviewed: boolean;
  try {
    reviewed = await reviewAdminConductFlag(service, id, user.id);
  } catch {
    return apiFail('DB_ERROR', 'Unable to update conduct flag', 500);
  }
  if (!reviewed) return apiFail('NOT_FOUND', 'Conduct flag not found or already reviewed', 404);

  return apiOk({ id, status: 'reviewed' });
}
