import { createServiceClient } from '@/lib/supabase/service';
import { guestPrivateResponse, resolveGuestSession } from '@/lib/checkout/guest-session';

/** Returns only the latest order belonging to the current guest cookie session. */
export async function GET(request: Request) {
  const guest = await resolveGuestSession(request);
  if (!guest) return guestPrivateResponse(null, 401);

  const { data, error } = await createServiceClient()
    .from('orders')
    .select('id,status')
    .eq('guest_subject_id', guest.guestSubjectId)
    .is('user_id', null)
    .is('guest_session_revoked_at', null)
    .in('status', ['pending_payment', 'paid', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return guestPrivateResponse(null, 503);
  return guestPrivateResponse(data ? { orderId: data.id, status: data.status } : null);
}
