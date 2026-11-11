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
import { createHash } from 'node:crypto';
import { z } from 'zod';

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
  const { data: ticket, error: ticketError } = await service
    .from('support_tickets')
    .select('id, subject, user_id, assigned_to, status')
    .eq('id', id)
    .maybeSingle();
  if (ticketError) return apiFail('READ_UNAVAILABLE', 'Unable to load this support request.', 503);
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdmin = await isSuperAdmin(supabase, user.id);
  const isOwner = ticket.user_id === user.id;
  if (!isAdmin && !isOwner) return apiFail('FORBIDDEN', 'Not your ticket', 403);
  const senderRole: 'customer' | 'admin' = isAdmin ? 'admin' : 'customer';

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }

  const file = formData.get('file');
  if (!(file instanceof File)) return apiFail('MISSING_FILE', 'file is required', 422);
  const operationId = formData.get('operationId');
  if (typeof operationId !== 'string' || !z.string().uuid().safeParse(operationId).success) {
    return apiFail('UPDATE_REQUIRED', 'Refresh the ticket page before sending an attachment.', 409);
  }

  const validated = await validateChatAttachment(file);
  if (!validated.ok) {
    return apiFail(validated.code, 'File must be a JPEG, PNG, WEBP, or PDF under 10 MB', 422);
  }

  const captionField = formData.get('caption');
  if (captionField !== null && typeof captionField !== 'string') {
    return apiFail('INVALID_CAPTION', 'Caption must be text.', 422);
  }
  const rawCaption = captionField?.trim() ?? '';
  if (rawCaption.length > 2000) return apiFail('INVALID_CAPTION', 'Caption is too long.', 422);
  const cleaned = await cleanUserContent(rawCaption, service);
  const fileHash = createHash('sha256').update(Buffer.from(validated.buffer)).digest('hex');
  const operationPayloadHash = createHash('sha256').update(JSON.stringify({
    ticketId: id,
    senderId: user.id,
    senderRole,
    body: cleaned.display,
    fileHash,
    mimeType: file.type,
    size: file.size,
  })).digest('hex');

  const findExistingAttachmentReply = () => service.from('support_ticket_replies')
    .select('id, ticket_id, sender_id, sender_role, body, created_at, operation_payload_hash')
    .eq('ticket_id', id)
    .eq('sender_id', user.id)
    .eq('operation_id', operationId)
    .maybeSingle();
  const { data: existingReply, error: lookupError } = await findExistingAttachmentReply();
  if (lookupError) return apiFail('READ_UNAVAILABLE', 'Unable to check the attachment result.', 503);
  if (existingReply) {
    if (existingReply.operation_payload_hash !== operationPayloadHash) {
      return apiFail('OPERATION_CONFLICT', 'This attachment key was already used for different content.', 409);
    }
    return apiOk({
      id: existingReply.id,
      senderId: existingReply.sender_id,
      senderRole: existingReply.sender_role,
      body: existingReply.body,
      createdAt: existingReply.created_at,
      newStatus: ticket.status,
    });
  }

  if (senderRole === 'customer' && LOCKED_STATUSES.has(ticket.status)) {
    return apiFail('TICKET_LOCKED', 'This ticket is resolved. Reopen it to reply.', 403);
  }

  const path = buildTicketAttachmentPath(id, crypto.randomUUID(), file.type);
  const upload = await service.storage.from('ticket-attachments').upload(path, validated.buffer, { contentType: file.type, upsert: false });
  if (upload.error) return apiFail('UPLOAD_FAILED', 'Unable to upload attachment', 502);

  const { data: reply, error: replyErr } = await service
    .from('support_ticket_replies')
    .insert({ ticket_id: id, sender_id: user.id, sender_role: senderRole, body: cleaned.display, attachment_url: path, operation_id: operationId, operation_payload_hash: operationPayloadHash })
    .select('id, sender_id, sender_role, body, created_at, operation_payload_hash')
    .single();
  if (replyErr) {
    await service.storage.from('ticket-attachments').remove([path]);
    if (replyErr.code === '23505') {
      const { data: racedReply, error: raceError } = await findExistingAttachmentReply();
      if (raceError) return apiFail('READ_UNAVAILABLE', 'Unable to check the attachment result.', 503);
      if (racedReply?.operation_payload_hash === operationPayloadHash) {
        return apiOk({
          id: racedReply.id,
          senderId: racedReply.sender_id,
          senderRole: racedReply.sender_role,
          body: racedReply.body,
          createdAt: racedReply.created_at,
          newStatus: ticket.status,
        });
      }
      if (racedReply) return apiFail('OPERATION_CONFLICT', 'This attachment key was already used for different content.', 409);
    }
    return apiFail('WRITE_UNAVAILABLE', 'The attachment could not be added. Keep the file selected and try again.', 503);
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

  return apiOk(
    {
      id: reply.id,
      senderId: reply.sender_id,
      senderRole: reply.sender_role,
      body: reply.body,
      createdAt: reply.created_at,
      newStatus: statusUpdate.status ?? ticket.status,
    },
    { status: 201 },
  );
}

export async function GET(request: Request, { params }: Props) {
  void request;
  void params;
  return apiFail('ATTACHMENT_ROUTE_MOVED', 'Refresh this ticket to open its attachment.', 410);
}
