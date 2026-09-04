// P4 — Member 4: link re-enable (CLAUDE-PHASE2.md Feature C, Section 4:
// "Admin can re-enable it from the dashboard")
// PATCH /api/admin/affiliate/links/[id] — body { action: 'reactivate' }
// Gated on super_admin, checked server-side. There is no matching
// manual "disable" action here — disabling only ever happens via the
// auto-disable path (lib/affiliate/fraud.ts) or the fraud-flags "Confirm &
// disable" action, both of which already write their own audit_logs entry.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { reactivateLinkSchema } from '@/lib/validation/affiliate-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { reactivateLink } from '@/lib/affiliate/fraud';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can re-enable an affiliate link', 403);
  }

  const parsed = await parseBody(request, reactivateLinkSchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: link } = await service.from('affiliate_links').select('id').eq('id', id).maybeSingle();
  if (!link) return apiFail('NOT_FOUND', 'Affiliate link not found', 404);

  await reactivateLink(service, id, user.id);
  return apiOk({ id, isActive: true });
}
