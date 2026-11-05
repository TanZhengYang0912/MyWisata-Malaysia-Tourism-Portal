// GET /api/vendors/[vendorId]/inbox/[threadId] — one conversation's messages
// for the vendor inbox, paged instead of shipped inside every list refresh.
//   (no cursor)        newest PAGE_SIZE messages
//   ?before=<iso>      the PAGE_SIZE messages before that time ("load older")
//   ?after=<iso>       messages from that time on (catch-up; normally few)
// Messages come back oldest first; `hasOlder` says whether more exist before.

import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; threadId: string }> }

const PAGE_SIZE = 50;
const MESSAGE_COLUMNS = 'id,sender_id,body,created_at,attachment_url,reply_to_message_id,context_product_id,context_snapshot';

function cursor(value: string | null): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export async function GET(request: Request, { params }: Props) {
  const { vendorId, threadId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const { serviceDb: service, outletIds } = access.access;

  // Same scope check as sending a reply: the thread must be at one of this
  // user's permitted outlets of this vendor.
  const { data: thread, error: threadError } = await service.from('chat_threads').select('id,outlet_id').eq('id', threadId).maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread || !outletIds.includes(thread.outlet_id)) return apiFail('NOT_FOUND', 'Conversation not found', 404);

  const url = new URL(request.url);
  const before = cursor(url.searchParams.get('before'));
  const after = cursor(url.searchParams.get('after'));

  if (after) {
    // Inclusive so a message sharing the cursor's timestamp is not skipped;
    // the client de-duplicates by id.
    const { data, error } = await service.from('chat_messages').select(MESSAGE_COLUMNS)
      .eq('thread_id', threadId).gte('created_at', after)
      .order('created_at', { ascending: true }).limit(PAGE_SIZE);
    if (error) return apiFail('DB_ERROR', error.message, 500);
    return apiOk({ messages: data ?? [], hasOlder: null });
  }

  let query = service.from('chat_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const rows = data ?? [];
  return apiOk({ messages: rows.slice(0, PAGE_SIZE).reverse(), hasOlder: rows.length > PAGE_SIZE });
}
