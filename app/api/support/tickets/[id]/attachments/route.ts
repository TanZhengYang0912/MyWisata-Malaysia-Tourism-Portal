// P4 — Member 4: support ticket file attachments — POST uploads a file as a
// reply (optionally captioned), GET returns a short-lived signed URL for an
// already-uploaded one. Mirrors app/api/chat/[threadId]/attachments/route.ts
// (same validate -> upload -> insert -> sign shape) but writes into
// support_ticket_replies instead of chat_messages, so it carries the same
// side effects as POST .../replies (status transition, notify, moderation/
// conduct flags) — those aren't shared into a helper since the two routes'
// insert shapes differ enough (this one adds attachment_url, caption is
// optional) that a shared function would need as many branches as it saves.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { notifyTicketReply } from '@/lib/support/notify';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';
import { logAdminConductFlagIfNeeded } from '@/lib/moderation/admin-conduct';
import { validateChatAttachment, buildTicketAttachmentPath } from '@/lib/support/attachment';

interface Props {
  params: Promise<{ id: string }>;
}

const LOCKED_STATUSES = new Set(['resolved', 'closed']);

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket } = await service
    .from('support_tickets')
    .select('id, subject, user_id, assigned_to, status')
    .eq('id', id)
    .maybeSingle();
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdmin = await isSuperAdmin(supabase, user.id);
  const isOwner = ticket.user_id === user.id;
  if (!isAdmin && !isOwner) return apiFail('FORBIDDEN', 'Not your ticket', 403);
  const senderRole: 'customer' | 'admin' = isAdmin ? 'admin' : 'customer';

  if (senderRole === 'customer' && LOCKED_STATUSES.has(ticket.status)) {
    return apiFail('TICKET_LOCKED', 'This ticket is resolved. Reopen it to reply.', 403);
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }

  const file = formData.get('file');
  if (!(file instanceof File)) return apiFail('MISSING_FILE', 'file is required', 422);

  const validated = await validateChatAttachment(file);
  if (!validated.ok) {
    return apiFail(validated.code, 'File must be a JPEG, PNG, WEBP, or PDF under 10 MB', 422);
  }

  const rawCaption = (formData.get('caption') as string | null)?.trim() ?? '';
  const cleaned = await cleanUserContent(rawCaption, service);

  const path = buildTicketAttachmentPath(id, crypto.randomUUID(), file.type);
  const upload = await service.storage.from('ticket-attachments').upload(path, validated.buffer, { contentType: file.type, upsert: false });
  if (upload.error) return apiFail('UPLOAD_FAILED', 'Unable to upload attachment', 502);

  const { data: reply, error: replyErr } = await service
    .from('support_ticket_replies')
    .insert({ ticket_id: id, sender_id: user.id, sender_role: senderRole, body: cleaned.display, attachment_url: path })
    .select('id, sender_id, sender_role, body, attachment_url, created_at')
    .single();
  if (replyErr) {
    await service.storage.from('ticket-attachments').remove([path]);
    return apiFail('DB_ERROR', replyErr.message, 500);
  }

  if (cleaned.hadSlur) {
    await logModerationFlag(service, {
      sourceType: 'ticket_reply',
      sourceId: reply.id,
      userId: user.id,
      originalExcerpt: cleaned.original,
    });
  }

  if (senderRole === 'admin') {
    await logAdminConductFlagIfNeeded(service, {
      cleaned,
      flaggedAdminId: user.id,
      targetUserId: ticket.user_id,
      source: 'ticket_reply',
      sourceRefId: ticket.id,
    });
  }

  const statusUpdate: { last_reply_at: string; status?: string; assigned_to?: string } = {
    last_reply_at: new Date().toISOString(),
  };
  if (senderRole === 'admin') {
    if (ticket.status === 'open') statusUpdate.status = 'in_progress';
    if (!ticket.assigned_to) statusUpdate.assigned_to = user.id;
  }
  await service.from('support_tickets').update(statusUpdate).eq('id', id);

  await notifyTicketReply(service, ticket, senderRole, cleaned.display || 'Sent an attachment');

  const signed = await service.storage.from('ticket-attachments').createSignedUrl(path, 300);

  return apiOk(
    {
      id: reply.id,
      senderId: reply.sender_id,
      senderRole: reply.sender_role,
      body: reply.body,
      attachmentUrl: reply.attachment_url,
      createdAt: reply.created_at,
      newStatus: statusUpdate.status ?? ticket.status,
      signedUrl: signed.data?.signedUrl ?? null,
    },
    { status: 201 },
  );
}

export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket } = await service.from('support_tickets').select('id, user_id').eq('id', id).maybeSingle();
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdmin = await isSuperAdmin(supabase, user.id);
  if (ticket.user_id !== user.id && !isAdmin) return apiFail('FORBIDDEN', 'Not your ticket', 403);

  const path = new URL(request.url).searchParams.get('path');
  if (!path || !path.startsWith(`${id}/`)) return apiFail('NOT_FOUND', 'Attachment not found', 404);

  const signed = await service.storage.from('ticket-attachments').createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable', 500);

  return apiOk({ signedUrl: signed.data.signedUrl, expiresIn: 300 });
}
