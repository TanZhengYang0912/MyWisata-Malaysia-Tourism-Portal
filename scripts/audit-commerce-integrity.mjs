import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const [{ data: slots }, { data: orders }, { data: payments }, { count: pendingHolds }] = await Promise.all([
  db.from('booking_slots').select('booked,capacity'),
  db.from('orders').select('id,status').neq('status', 'draft'),
  db.from('payments').select('order_id'),
  db.from('checkout_sessions').select('id', { count: 'exact', head: true }).in('status', ['pending_payment', 'requires_action']),
]);
const overCapacity = (slots ?? []).filter((slot) => Number(slot.booked) > Number(slot.capacity)).length;
const paidOrderIds = new Set((payments ?? []).map((payment) => payment.order_id));
const ordersWithoutPayment = (orders ?? []).filter((order) => !paidOrderIds.has(order.id)).length;
console.log(JSON.stringify({ overCapacity: overCapacity ?? 0, ordersWithoutPayment, pendingCheckoutSessions: pendingHolds ?? 0 }, null, 2));
