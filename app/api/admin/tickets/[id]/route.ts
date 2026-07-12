// P4 — Member 4: admin ticket status update
// PATCH /api/admin/tickets/[id] — body { status }. See CLAUDE.md Step 9.
// Gated on super_admin/approver, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateTicketStatusSchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can update support tickets', 403);
  }

  const parsed = await parseBody(request, updateTicketStatusSchema);
  if (!parsed.ok) return parsed.response;
  const { status } = parsed.data;

  // support_tickets has SELECT/INSERT RLS policies but no UPDATE policy at
  // all (007_public_read_policies.sql) — same shape as orders/order_items —
  // so this needs the service-role client even after the role check above.
  const service = createServiceClient();
  const { data, error } = await service
    .from('support_tickets')
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  return apiOk(data);
}
