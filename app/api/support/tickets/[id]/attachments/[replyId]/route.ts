import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string; replyId: string }>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};

export async function GET(_request: Request, { params }: Props) {
  const { id, replyId } = await params;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket, error: ticketError } = await service
    .from('support_tickets').select('id,user_id').eq('id', id).maybeSingle();
  if (ticketError) return apiFail('READ_UNAVAILABLE', 'Unable to load this ticket attachment.', 503);
  if (!ticket) return apiFail('NOT_FOUND', 'Attachment not found.', 404);
  const isAdmin = await isSuperAdmin(auth, user.id);
  if (ticket.user_id !== user.id && !isAdmin) return apiFail('NOT_FOUND', 'Attachment not found.', 404);

  const { data: reply, error: replyError } = await service
    .from('support_ticket_replies')
    .select('attachment_url')
    .eq('id', replyId)
    .eq('ticket_id', id)
    .maybeSingle();
  if (replyError) return apiFail('READ_UNAVAILABLE', 'Unable to load this ticket attachment.', 503);
  if (!reply?.attachment_url) return apiFail('NOT_FOUND', 'Attachment not found.', 404);

  const extension = reply.attachment_url.split('.').pop()?.toLowerCase() ?? '';
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable.', 503);
  if (!reply.attachment_url.startsWith(`${id}/`)) return apiFail('NOT_FOUND', 'Attachment not found.', 404);
  const { data: file, error: downloadError } = await service
    .storage.from('ticket-attachments').download(reply.attachment_url);
  if (downloadError || !file) return apiFail('ATTACHMENT_UNAVAILABLE', 'Attachment is temporarily unavailable.', 503);
  return new Response(file, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="support-attachment.${extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
