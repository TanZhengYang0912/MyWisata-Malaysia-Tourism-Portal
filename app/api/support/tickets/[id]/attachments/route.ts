// Support attachments are reserved before Storage and bound by one database
// transaction after the server verifies the uploaded object's bytes.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';
import { logAdminConductFlagIfNeeded } from '@/lib/moderation/admin-conduct';
import { readTicketAttachmentForm, validateChatAttachment } from '@/lib/support/attachment';
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

  const formResult = await readTicketAttachmentForm(request);
  if (!formResult.ok) {
    return formResult.reason === 'too_large'
      ? apiFail('FILE_TOO_LARGE', 'Attachment request is too large.', 413)
      : apiFail('INVALID_FORM', 'Could not parse form data.', 400);
  }
  const { data: formData } = formResult;

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

  let reservationData: unknown;
  let reservationError: { message: string } | null;
  try {
    const reservation = await service.rpc('reserve_support_attachment', {
      p_operation_id: operationId,
      p_ticket_id: id,
      p_actor_id: user.id,
      p_sender_role: senderRole,
      p_operation_payload_hash: operationPayloadHash,
      p_server_sha256: fileHash,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });
    reservationData = reservation.data;
    reservationError = reservation.error;
  } catch {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
  }
  if (reservationError) {
    if (reservationError.message === 'support_attachment_result_unavailable') {
      try {
        const retried = await service.rpc('retry_support_attachment', {
          p_operation_id: operationId,
          p_ticket_id: id,
          p_actor_id: user.id,
          p_sender_role: senderRole,
          p_operation_payload_hash: operationPayloadHash,
          p_server_sha256: fileHash,
          p_mime_type: file.type,
          p_size_bytes: file.size,
        });
        if (!retried.error && retried.data) reservationData = retried.data;
        else if (retried.error) return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
      } catch {
        return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
      }
    } else {
      const knownErrors: Record<string, { code: string; message: string; status: number }> = {
        support_ticket_not_found: { code: 'NOT_FOUND', message: 'Ticket not found.', status: 404 },
        support_ticket_forbidden: { code: 'FORBIDDEN', message: 'You cannot reply to this ticket.', status: 403 },
        support_ticket_locked: { code: 'TICKET_LOCKED', message: 'This ticket is resolved. Reopen it to reply.', status: 403 },
        support_ticket_operation_conflict: { code: 'OPERATION_CONFLICT', message: 'This attachment key was already used for different content.', status: 409 },
        support_ticket_invalid_attachment: { code: 'INVALID_INPUT', message: 'Choose a valid attachment and try again.', status: 422 },
      };
      const knownError = knownErrors[reservationError.message];
      if (knownError) return apiFail(knownError.code, knownError.message, knownError.status);
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
    }
  }
  if (typeof reservationData !== 'object' || reservationData === null) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
  }
  const reservation = reservationData as Record<string, unknown>;
  if (reservation.state === 'bound') {
    const boundReply = reservation.reply;
    if (typeof boundReply === 'object' && boundReply !== null) {
      const reply = boundReply as Record<string, unknown>;
      if (typeof reply.id === 'string' && typeof reply.sender_id === 'string'
          && (reply.sender_role === 'customer' || reply.sender_role === 'admin')
          && typeof reply.body === 'string' && typeof reply.created_at === 'string'
          && typeof reply.new_status === 'string') {
        return apiOk({
          id: reply.id,
          senderId: reply.sender_id,
          senderRole: reply.sender_role,
          body: reply.body,
          createdAt: reply.created_at,
          newStatus: reply.new_status,
        });
      }
    }
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
  }
  if (!['reserved', 'uploaded', 'unknown'].includes(String(reservation.state))
      || typeof reservation.storage_path !== 'string'
      || typeof reservation.lease_token !== 'string'
      || !z.string().uuid().safeParse(reservation.lease_token).success) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
  }
  const pathParts = reservation.storage_path.split('/');
  if (pathParts.length !== 2 || pathParts[0] !== id
      || !/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(pathParts[1])) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
  }
  const path = reservation.storage_path;
  const leaseToken = reservation.lease_token;
  const attachmentStorage = service.storage.from('ticket-attachments');
  let objectVerified = reservation.state === 'uploaded' || reservation.state === 'unknown';

  if (reservation.state === 'reserved') {
    let startedError: { message: string } | null;
    try {
      ({ error: startedError } = await service.rpc('mark_support_attachment_started', {
        p_operation_id: operationId,
        p_actor_id: user.id,
        p_lease_token: leaseToken,
      }));
    } catch {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);
    }
    if (startedError) return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment status. Check this ticket before trying again.', 503);

    let uploadError: unknown;
    try {
      ({ error: uploadError } = await attachmentStorage.upload(path, validated.buffer, { contentType: file.type, upsert: false }));
    } catch {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
    }
    if (!uploadError) {
      objectVerified = true;
    } else {
      objectVerified = false;
    }
  }

  if (!objectVerified || reservation.state !== 'reserved') {
    let existingFile: Blob | null = null;
    let downloadError: { statusCode?: string } | null = null;
    try {
      const download = await attachmentStorage.download(path);
      existingFile = download.data;
      downloadError = download.error;
    } catch {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
    }
    if (!existingFile) {
      if (downloadError?.statusCode === '404' && reservation.state === 'reserved') {
        return apiFail('ATTACHMENT_RESELECT_REQUIRED', 'The file could not be confirmed. Choose it again to start a new upload.', 409);
      }
      if (downloadError?.statusCode === '404' && reservation.state === 'unknown') {
        return apiFail('ATTACHMENT_RESELECT_REQUIRED', 'The file could not be confirmed. Choose it again to start a new upload.', 409);
      }
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
    }
    let existingBytes: Buffer;
    try {
      existingBytes = Buffer.from(await existingFile.arrayBuffer());
    } catch {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
    }
    const existingHash = createHash('sha256').update(existingBytes).digest('hex');
    if (existingBytes.length !== file.size || existingHash !== fileHash) {
      return apiFail('OPERATION_CONFLICT', 'This attachment key was already used for different content.', 409);
    }
    objectVerified = true;
  }

  if (objectVerified) {
    let uploadedError: { message: string } | null;
    try {
      ({ error: uploadedError } = await service.rpc('mark_support_attachment_uploaded', {
        p_operation_id: operationId,
        p_actor_id: user.id,
        p_lease_token: leaseToken,
      }));
    } catch {
      return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
    }
    if (uploadedError) return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
  }

  let result: unknown;
  let commitError: { message: string } | null;
  try {
    const committed = await service.rpc('commit_support_ticket_attachment', {
      p_ticket_id: id,
      p_actor_id: user.id,
      p_sender_role: senderRole,
      p_body: cleaned.display,
      p_attachment_path: path,
      p_operation_id: operationId,
      p_operation_payload_hash: operationPayloadHash,
      p_lease_token: leaseToken,
    });
    result = committed.data;
    commitError = committed.error;
  } catch {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
  }
  if (commitError) {
    const knownErrors: Record<string, { code: string; message: string; status: number }> = {
      support_ticket_not_found: { code: 'NOT_FOUND', message: 'Ticket not found.', status: 404 },
      support_ticket_forbidden: { code: 'FORBIDDEN', message: 'You cannot reply to this ticket.', status: 403 },
      support_ticket_locked: { code: 'TICKET_LOCKED', message: 'This ticket is resolved. Reopen it to reply.', status: 403 },
      support_ticket_operation_conflict: { code: 'OPERATION_CONFLICT', message: 'This attachment key was already used for different content.', status: 409 },
      support_ticket_invalid_attachment: { code: 'INVALID_INPUT', message: 'Choose a valid attachment and try again.', status: 422 },
    };
    const knownError = knownErrors[commitError.message];
    if (knownError) return apiFail(knownError.code, knownError.message, knownError.status);
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
  }
  if (typeof result !== 'object' || result === null) {
    return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);
  }
  const reply = result as Record<string, unknown>;
  if (
    typeof reply.id !== 'string'
    || typeof reply.sender_id !== 'string'
    || (reply.sender_role !== 'customer' && reply.sender_role !== 'admin')
    || typeof reply.body !== 'string'
    || typeof reply.created_at !== 'string'
    || typeof reply.new_status !== 'string'
    || typeof reply.created !== 'boolean'
    || (reply.ticket_user_id !== null && typeof reply.ticket_user_id !== 'string')
  ) return apiFail('WRITE_UNAVAILABLE', 'We could not confirm the attachment result. Check this ticket before trying again.', 503);

  if (reply.created && cleaned.hadSlur) {
    await logModerationFlag(service, {
      sourceType: 'ticket_reply',
      sourceId: reply.id,
      userId: user.id,
      originalExcerpt: cleaned.original,
    });
  }

  if (reply.created && senderRole === 'admin') {
    await logAdminConductFlagIfNeeded(service, {
      cleaned,
      flaggedAdminId: user.id,
      targetUserId: reply.ticket_user_id as string | null,
      source: 'ticket_reply',
      sourceRefId: ticket.id,
    });
  }

  return apiOk(
    {
      id: reply.id,
      senderId: reply.sender_id,
      senderRole: reply.sender_role,
      body: reply.body,
      createdAt: reply.created_at,
      newStatus: reply.new_status,
    },
    { status: reply.created ? 201 : 200 },
  );
}

export async function GET(request: Request, { params }: Props) {
  void request;
  void params;
  return apiFail('ATTACHMENT_ROUTE_MOVED', 'Refresh this ticket to open its attachment.', 410);
}
