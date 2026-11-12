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
import { getRequestId } from '@/lib/request-id';
import { getAuthenticatedUser } from '@/lib/auth/request-user';

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = error.code;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'unknown';
}

function writeUnavailable(request: Request, errorCode: string) {
  const requestId = getRequestId(request);
  console.error('[conduct/report] insert failed', { requestId, errorCode });
  return apiFail('WRITE_UNAVAILABLE', 'We could not confirm whether the report was sent. Do not submit it again now; return to the conversation and contact Support if needed.', 503, undefined, { requestId });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const authentication = await getAuthenticatedUser(supabase);
  if (authentication.state === 'unauthenticated') return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (authentication.state === 'unavailable') {
    const requestId = getRequestId(request);
    console.error('[conduct/report] authentication check failed', { requestId });
    return apiFail('READ_UNAVAILABLE', 'Unable to verify your sign-in. Check your connection and try again.', 503, undefined, { requestId });
  }
  const { user } = authentication;

  const parsed = await parseBody(request, reportChatSchema);
  if (!parsed.ok) return parsed.response;
  const { chatType, threadId, reason } = parsed.data;

  const service = createServiceClient();

  let partyAId: string;
  let partyBId: string | null;

  if (chatType === 'user_vendor') {
    const { data: thread, error: threadError } = await service
      .from('chat_threads')
      .select('id, customer_id, outlet_id')
      .eq('id', threadId)
      .maybeSingle();
    if (threadError) return apiFail('READ_UNAVAILABLE', 'Unable to verify this conversation. Try again.', 503);
    if (!thread) return apiFail('NOT_FOUND', 'Chat thread not found', 404);

    const { data: outlet, error: outletError } = await service.from('outlets').select('id, vendor_id').eq('id', thread.outlet_id).maybeSingle();
    if (outletError) return apiFail('READ_UNAVAILABLE', 'Unable to verify this conversation. Try again.', 503);
    if (!outlet) return apiFail('NOT_FOUND', 'Chat thread not found', 404);

    const { data: vendor, error: vendorError } = await service.from('vendors').select('id, owner_id').eq('id', outlet.vendor_id).maybeSingle();
    if (vendorError) return apiFail('READ_UNAVAILABLE', 'Unable to verify this conversation. Try again.', 503);
    if (!vendor) return apiFail('NOT_FOUND', 'Chat thread not found', 404);
    const { data: manager, error: managerError } = await service
      .from('outlet_managers')
      .select('user_id')
      .eq('outlet_id', thread.outlet_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (managerError) return apiFail('READ_UNAVAILABLE', 'Unable to verify this conversation. Try again.', 503);

    const isParticipant = thread.customer_id === user.id || vendor?.owner_id === user.id || Boolean(manager);
    if (!isParticipant) return apiFail('NOT_FOUND', 'Chat thread not found', 404);

    partyAId = thread.customer_id;
    partyBId = vendor?.owner_id ?? null;
  } else if (chatType === 'user_admin') {
    const { data: ticket, error: ticketError } = await service
      .from('support_tickets')
      .select('id, user_id, assigned_to')
      .eq('id', threadId)
      .maybeSingle();
    if (ticketError) return apiFail('READ_UNAVAILABLE', 'Unable to verify this support request. Try again.', 503);
    if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

    let isTicketAdmin = false;
    if (ticket.user_id !== user.id) {
      try {
        isTicketAdmin = await isSuperAdmin(supabase, user.id, { throwOnLookupError: true });
      } catch {
        const requestId = getRequestId(request);
        console.error('[conduct/report] ticket access check failed', { requestId });
        return apiFail('READ_UNAVAILABLE', 'Unable to verify access to this support request. Try again.', 503, undefined, { requestId });
      }
    }
    const isParticipant = ticket.user_id === user.id || isTicketAdmin;
    if (!isParticipant) return apiFail('NOT_FOUND', 'Ticket not found', 404);

    partyAId = ticket.user_id;
    partyBId = ticket.assigned_to;
  } else {
    return apiFail('NOT_SUPPORTED', 'Vendor-admin chat reporting is not available yet', 400);
  }

  let result;
  try {
    result = await createChatConductReport(service, {
      reporterId: user.id,
      partyAId,
      partyBId,
      chatType,
      threadRef: threadId,
      reason: reason ?? null,
    });
  } catch (error) {
    return writeUnavailable(request, safeErrorCode(error));
  }

  if (!result.ok) {
    if (result.reason === 'duplicate') return apiFail('ALREADY_REPORTED', 'You already have an open report for this chat', 409);
    return writeUnavailable(request, result.errorCode && /^[A-Z0-9]{5}$/.test(result.errorCode) ? result.errorCode : 'unknown');
  }

  return apiOk({ id: result.id }, { status: 201 });
}
