// P4 — Member 4: mark a moderation flag reviewed. CLAUDE-MODERATION.md.
// PATCH /api/admin/moderation/flags/[id]

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { reviewModerationFlag } from '@/lib/moderation/flags';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can review moderation flags', 403);
  }

  // moderation_flags has no UPDATE policy (read-only via RLS by design —
  // see migration 036) — every write goes through the service-role client
  // after the role check above, same pattern as every other admin write in
  // this module.
  const service = createServiceClient();
  const reviewed = await reviewModerationFlag(service, id);
  if (!reviewed) return apiFail('NOT_FOUND', 'Flag not found or already reviewed', 404);

  return apiOk({ reviewed: true });
}
