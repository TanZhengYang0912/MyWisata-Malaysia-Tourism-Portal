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
    .select('id,customer_id,outlet_id,vendor_id,last_message_at,created_at,outlets(id,name,city,state),chat_messages(id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id)')
    .eq('id', threadId)
    .eq('customer_id', user.id)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Conversation not found', 404);

  return apiOk(data);
}
