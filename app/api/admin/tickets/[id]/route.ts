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
import { databaseUuidSchema } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const parsedId = databaseUuidSchema.safeParse(id);
  if (!parsedId.success) return apiFail('INVALID_ID', 'Ticket id is invalid', 422);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can update support tickets', 403);
  }

  const parsed = await parseBody(request, updateTicketStatusSchema);
  if (!parsed.ok) return parsed.response;
  const { status, category } = parsed.data;

  // The authenticated RPC derives its actor from auth.uid(), then performs
  // the version check and commits the change plus notification atomically.
  const service = createServiceClient();
  const { data: current, error: readError } = await service
    .from('support_tickets')
    .select('updated_at')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (readError) return apiFail('DB_ERROR', 'Unable to update support ticket', 500);
  if (!current) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const { data, error } = await supabase.rpc('admin_update_support_ticket', {
    p_ticket_id: parsedId.data,
    p_expected_updated_at: current.updated_at,
    p_status: status ?? null,
    p_category: category ?? null,
  });
  if (error) {
    if (error.message.includes('support_ticket_stale')) return apiFail('CONFLICT', 'Ticket changed. Refresh and try again.', 409);
    if (error.message.includes('support_ticket_not_found')) return apiFail('NOT_FOUND', 'Ticket not found', 404);
    if (error.message.includes('permission_required')) return apiFail('FORBIDDEN', 'Only Super Admin can update support tickets', 403);
    return apiFail('DB_ERROR', 'Unable to update support ticket', 500);
  }

  return apiOk(data);
}
