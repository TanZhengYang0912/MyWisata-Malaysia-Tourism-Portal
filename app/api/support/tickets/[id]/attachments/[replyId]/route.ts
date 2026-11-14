import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getRequestId } from '@/lib/request-id';

interface Props {
  params: Promise<{ id: string; replyId: string }>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = error.code;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'unknown';
}

function isMissingAuthSession(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AuthSessionMissingError');
}

function readUnavailable(request: Request, operation: string, error: unknown) {
  const requestId = getRequestId(request);
  console.error('[support/attachment] read failed', { requestId, operation, errorCode: errorCode(error) });
  return apiFail('READ_UNAVAILABLE', 'This attachment is temporarily unavailable. Try again.', 503, undefined, { requestId });
}

function attachmentUnavailable(request: Request, error: unknown) {
  const requestId = getRequestId(request);
  console.error('[support/attachment] download failed', { requestId, operation: 'storage', errorCode: errorCode(error) });
  return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable. Try again.', 503, undefined, { requestId });
}

export async function GET(request: Request, { params }: Props) {
  const { id, replyId } = await params;
  let auth: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  try {
    auth = await createClient();
    const result = await auth.auth.getUser();
    if (isMissingAuthSession(result.error)) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
    if (result.error) return readUnavailable(request, 'auth', result.error);
    user = result.data.user;
  } catch (error) {
    if (isMissingAuthSession(error)) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
    return readUnavailable(request, 'auth', error);
  }
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let service: ReturnType<typeof createServiceClient>;
  let ticket: { id: string; user_id: string } | null;
  let ticketError: { code?: string; message?: string } | null;
  try {
    service = createServiceClient();
    const result = await service
      .from('support_tickets').select('id,user_id').eq('id', id).maybeSingle();
    ticket = result.data;
    ticketError = result.error;
  } catch (error) {
    return readUnavailable(request, 'ticket', error);
  }
  if (ticketError) return readUnavailable(request, 'ticket', ticketError);
  if (!ticket) return apiFail('NOT_FOUND', 'Attachment not found.', 404);
  const isOwner = ticket.user_id === user.id;
  if (!isOwner) {
    let isAdmin: boolean;
    try {
      isAdmin = await isSuperAdmin(auth, user.id, { throwOnLookupError: true });
    } catch (error) {
      return readUnavailable(request, 'admin_access', error);
    }
    if (!isAdmin) return apiFail('NOT_FOUND', 'Attachment not found.', 404);
  }

  let attachmentUrl: string | null;
  let replyError: { code?: string; message?: string } | null;
  try {
    const result = await service
      .from('support_ticket_replies')
      .select('attachment_url')
      .eq('id', replyId)
      .eq('ticket_id', id)
      .maybeSingle();
    attachmentUrl = result.data?.attachment_url ?? null;
    replyError = result.error;
  } catch (error) {
    return readUnavailable(request, 'reply', error);
  }
  if (replyError) return readUnavailable(request, 'reply', replyError);
  if (!attachmentUrl) return apiFail('NOT_FOUND', 'Attachment not found.', 404);

  const [ticketFolder, filename, ...extraSegments] = attachmentUrl.split('/');
  if (ticketFolder !== id || extraSegments.length > 0
      || !/^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$/i.test(filename ?? '')) {
    return apiFail('NOT_FOUND', 'Attachment not found.', 404);
  }
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable.', 503);
  let file: Blob | null;
  let downloadError: { code?: string; statusCode?: string } | null;
  try {
    const result = await service.storage.from('ticket-attachments').download(attachmentUrl);
    file = result.data;
    downloadError = result.error;
  } catch (error) {
    return attachmentUnavailable(request, error);
  }
  if (downloadError || !file) return attachmentUnavailable(request, downloadError);
  return new Response(file, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="support-attachment.${extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
