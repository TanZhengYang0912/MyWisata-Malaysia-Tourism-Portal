// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 3/4: POST /api/conduct/report —
// the destination Feature 4 sets up ahead of Feature 3's report buttons.
// Any participant in a chat (user<->vendor, user<->admin) can report it; the
// report lands in chat_conduct_reports for the super-admin conduct panel's
// "Reported Chat" tab. Permission is validated server-side per chatType —
// never trust the caller's claim that they're a participant.
//
// vendor_admin is accepted by the schema/table for forward compatibility but
// rejected here: no vendor<->admin chat surface exists anywhere in this
// codebase yet (confirmed by search before writing this route). Wire it up
// once Feature 3 finds a real surface to attach it to.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { reportChatSchema } from '@/lib/validation/conduct-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { createChatConductReport } from '@/lib/moderation/chat-conduct-reports';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, reportChatSchema);
  if (!parsed.ok) return parsed.response;
  const { chatType, threadId, reason } = parsed.data;

  const service = createServiceClient();

  let partyAId: string;
  let partyBId: string | null;

  if (chatType === 'user_vendor') {
    const { data: thread } = await service
      .from('chat_threads')
      .select('id, customer_id, outlet_id')
      .eq('id', threadId)
      .maybeSingle();
    if (!thread) return apiFail('NOT_FOUND', 'Chat thread not found', 404);

    const { data: outlet } = await service.from('outlets').select('id, vendor_id').eq('id', thread.outlet_id).maybeSingle();
    const { data: vendor } = outlet
      ? await service.from('vendors').select('id, owner_id').eq('id', outlet.vendor_id).maybeSingle()
      : { data: null as { id: string; owner_id: string } | null };
    const { data: manager } = await service
      .from('outlet_managers')
      .select('user_id')
      .eq('outlet_id', thread.outlet_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const isParticipant = thread.customer_id === user.id || vendor?.owner_id === user.id || Boolean(manager);
    if (!isParticipant) return apiFail('FORBIDDEN', 'Not a participant in this chat', 403);

    partyAId = thread.customer_id;
    partyBId = vendor?.owner_id ?? null;
  } else if (chatType === 'user_admin') {
    const { data: ticket } = await service
      .from('support_tickets')
      .select('id, user_id, assigned_to')
      .eq('id', threadId)
      .maybeSingle();
    if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

    const isParticipant = ticket.user_id === user.id || (await isSuperAdmin(supabase, user.id));
    if (!isParticipant) return apiFail('FORBIDDEN', 'Not a participant in this ticket', 403);

    partyAId = ticket.user_id;
    partyBId = ticket.assigned_to;
  } else {
    return apiFail('NOT_SUPPORTED', 'Vendor-admin chat reporting is not available yet', 400);
  }

  const result = await createChatConductReport(service, {
    reporterId: user.id,
    partyAId,
    partyBId,
    chatType,
    threadRef: threadId,
    reason: reason ?? null,
  });

  if (!result.ok) {
    if (result.reason === 'duplicate') return apiFail('ALREADY_REPORTED', 'You already have an open report for this chat', 409);
    return apiFail('DB_ERROR', result.message ?? 'Unable to submit report', 500);
  }

  return apiOk({ id: result.id }, { status: 201 });
}
