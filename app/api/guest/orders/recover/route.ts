import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { guestPrivateResponse, guestAddressRateKey, hashGuestCredential, isSameOriginMutation, readGuestJson, reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { parseOrderReference } from '@/lib/checkout/order-reference';

const schema = z.object({
  orderId: z.string().uuid().optional(),
  orderReference: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().email().max(254),
}).strict().refine((input) => !(input.orderId && input.orderReference));

export async function POST(request:Request) {
  if (!isSameOriginMutation(request)) return guestPrivateResponse(null,403);
  const body=schema.safeParse(await readGuestJson(request));
  const response=()=>guestPrivateResponse({message:'If the details match a guest order, an access link will be emailed.'});
  if (!body.success) return response();
  if (!await reserveGuestRateLimit(`recovery:${guestAddressRateKey(request)}`,10,3600)) return response();
  const parsedReference = parseOrderReference(body.data.orderReference ?? body.data.orderId ?? '');
  const hasReference = Boolean(body.data.orderReference || body.data.orderId);
  if (hasReference && !parsedReference) return response();
  try {
  const service=createServiceClient({ signal: AbortSignal.timeout(10_000) });
  const emailHash = hashGuestCredential(body.data.email.toLowerCase());
  if (!await reserveGuestRateLimit(`recovery-email:${emailHash}`,3,3600)) return response();
  const query = service.from('orders').select('id,contact_email')
    .is('user_id',null).not('guest_subject_id','is',null).is('guest_session_revoked_at',null)
    .in('status',['pending_payment','paid','completed']);
  const {data,error}=parsedReference
    ? await query.eq(parsedReference.kind === 'id' ? 'id' : 'display_id',parsedReference.value).maybeSingle()
    : await query.ilike('contact_email',body.data.email.replace(/[\\%_]/g, '\\$&')).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
  if (error || !data) return response();
  if (!await reserveGuestRateLimit(`recovery-order:${data.id}`,3,3600)) return response();
  if (String(data.contact_email).toLowerCase()===body.data.email.toLowerCase()) {
    const window=Math.floor(Date.now()/3600000);
    const eventKey = `guest-recovery:${hashGuestCredential(`${data.id}:${window}`)}`;
    // A lost RPC response may already have committed. Reuse the same event key.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error: queueError } = await service.rpc('queue_guest_order_access', { p_order_id: data.id, p_event_key: eventKey, p_reason: 'Your requested private order link.' });
      if (!queueError) break;
      if (attempt === 1) console.error('[guest-order-recovery] access link enqueue failed', { orderId: data.id, code: queueError.code ?? 'unknown', window });
    }
  }
  } catch { console.error('[guest-order-recovery] recovery service unavailable'); }
  return response();
}
