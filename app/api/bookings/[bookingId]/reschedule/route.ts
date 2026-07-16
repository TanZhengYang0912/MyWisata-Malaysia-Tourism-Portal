import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';

const schema = z.object({ slotId: z.string().uuid() }).strict();
interface Props { params: Promise<{ bookingId: string }> }

export async function POST(request: Request, { params }: Props) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { data, error } = await db.rpc('reschedule_booking', { p_booking_id: (await params).bookingId, p_new_slot_id: parsed.data.slotId });
  if (error) {
    if (/not_owned|auth_required/.test(error.message)) return apiFail('FORBIDDEN', 'Booking access denied', 403);
    if (/unavailable|reschedulable/.test(error.message)) return apiFail('INVALID_STATE', 'The selected slot is no longer available', 409);
    return apiFail('DB_ERROR', error.message, 500);
  }
  return apiOk(data);
}
