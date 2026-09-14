import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props { params: Promise<{ threadId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { threadId } = await params;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data, error } = await service
    .from('chat_threads')
    .select('id,customer_id,outlet_id,vendor_id,last_message_at,created_at,outlets(id,name,city,state),chat_messages(id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id,context_snapshot)')
    .eq('id', threadId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Conversation not found', 404);

  // Receipts for the customer's OWN messages — which of them the vendor has
  // received / read. (The reverse direction — the vendor's view — is served by
  // /api/chat/[threadId]/read + /delivered.)
  const myMessageIds = (data.chat_messages ?? [])
    .filter((message: { sender_id: string; id: string }) => message.sender_id === user.id)
    .map((message: { id: string }) => message.id);

  let readByOthers: string[] = [];
  let deliveredByOthers: string[] = [];
  if (myMessageIds.length > 0) {
    const [{ data: reads }, { data: deliveries }] = await Promise.all([
      service.from('chat_message_reads').select('message_id').in('message_id', myMessageIds).neq('user_id', user.id),
      service.from('chat_message_deliveries').select('message_id').in('message_id', myMessageIds).neq('user_id', user.id),
    ]);
    readByOthers = [...new Set((reads ?? []).map((r: { message_id: string }) => r.message_id))];
    deliveredByOthers = [...new Set((deliveries ?? []).map((d: { message_id: string }) => d.message_id))];
  }

  const { count: openReportCount } = await service
    .from('chat_reports')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .eq('reporter_id', user.id)
    .eq('status', 'open');

  return apiOk({ ...data, readByOthers, deliveredByOthers, reportedByMe: (openReportCount ?? 0) > 0 });
}
