// P4 — Member 4: admin ticket status + category update
// PATCH /api/admin/tickets/[id] — body { status? } and/or { category? }. See
// CLAUDE.md Step 9, extended with a manual category override per
// CLAUDE-FIXES-2.md item 6 ("AI classification is a helper, not an authority").
// Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateTicketStatusSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { notifyTicketResolved } from '@/lib/support/notify';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can update support tickets', 403);
  }

  const parsed = await parseBody(request, updateTicketStatusSchema);
  if (!parsed.ok) return parsed.response;
  const { status, category } = parsed.data;

  const updates: { status?: string; resolved_at?: string | null; category?: string; classification_method?: string } = {};
  if (status !== undefined) {
    updates.status = status;
    updates.resolved_at = status === 'resolved' ? new Date().toISOString() : null;
  }
  if (category !== undefined) {
    updates.category = category;
    updates.classification_method = 'manual';
  }

  // support_tickets has SELECT/INSERT RLS policies but no UPDATE policy at
  // all (007_public_read_policies.sql) — same shape as orders/order_items —
  // so this needs the service-role client even after the role check above.
  const service = createServiceClient();
  const { data, error } = await service
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .select('id, subject, user_id, assigned_to, status, category')
    .maybeSingle();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  if (status === 'resolved') {
    await notifyTicketResolved(service, data);
  }

  return apiOk({ id: data.id, status: data.status, category: data.category });
}
