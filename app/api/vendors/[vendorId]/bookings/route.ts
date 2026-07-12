import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const service = access.access.serviceDb;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  const rawQ = (url.searchParams.get('q') || '').trim().replace(/^#/, '');
  const q = rawQ.replace(/[%(),]/g, ' ');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const outletId = url.searchParams.get('outletId');
  const productId = url.searchParams.get('productId');
  const vendorOutletIds = access.access.outletIds;
  const outletIds = outletId && vendorOutletIds.includes(outletId) ? [outletId] : vendorOutletIds;
  if (!outletIds.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 }, stats: {} });
  let slotQuery = service.from('booking_slots').select('id').in('outlet_id', outletIds);
  if (productId) slotQuery = slotQuery.eq('product_id', productId);
  if (from) slotQuery = slotQuery.gte('starts_at', from);
  if (to) slotQuery = slotQuery.lte('starts_at', to);
  const { data: slots, error: slotError } = await slotQuery;
  if (slotError) return apiFail('DB_ERROR', slotError.message, 500);
  const slotIds = (slots || []).map((slot: any) => slot.id);
  if (!slotIds.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 }, stats: {} });

  let query = service.from('bookings').select('id,display_id,status,created_at,check_in_at,demo_qr_code,customer_id,slot_id,order_item_id,order_items!inner(product_name,quantity,line_total,slot_starts_at,product_id,outlet_id,products(name,cover_url),outlets(id,name,city,state)),users(full_name,email),booking_slots!inner(starts_at,ends_at,capacity,booked,products(name,cover_url),outlets(id,name,city,state))', { count: 'exact' }).in('slot_id', slotIds);
  if (status && status !== 'all') query = query.eq('status', status);

  if (q) {
    const [{ data: matchingUsers }, { data: matchingItems }, { data: bookingIds }] = await Promise.all([
      service.from('users').select('id').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(100),
      service.from('order_items').select('id').eq('vendor_id', vendorId).in('outlet_id', vendorOutletIds).ilike('product_name', `%${q}%`).limit(100),
      service.from('bookings').select('id').in('slot_id', slotIds).ilike('display_id', `%${q}%`).limit(100),
    ]);
    const userIds = (matchingUsers || []).map((item: any) => item.id);
    const itemIds = (matchingItems || []).map((item: any) => item.id);
    const matchingBookingIds = (bookingIds || []).map((item: any) => item.id);
    const conditions = [];
    if (userIds.length) conditions.push(`customer_id.in.(${userIds.join(',')})`);
    if (itemIds.length) conditions.push(`order_item_id.in.(${itemIds.join(',')})`);
    if (matchingBookingIds.length) conditions.push(`id.in.(${matchingBookingIds.join(',')})`);
    if (!conditions.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 }, stats: {} });
    query = query.or(conditions.join(','));
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const { data: statRows } = await service.from('bookings').select('status').in('slot_id', slotIds);
  const stats = (statRows || []).reduce((result: Record<string, number>, item: any) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {});
  const items = (data || []).map((booking: any) => ({
    ...booking,
    customer: Array.isArray(booking.users) ? booking.users[0] : booking.users,
    orderItem: (() => { const item = Array.isArray(booking.order_items) ? booking.order_items[0] : booking.order_items; return item ? { ...item, outlets: item.outlets ? { ...item.outlets, full_name: item.outlets.name, name: outletShortName(item.outlets.name) } : item.outlets } : item; })(),
    slot: (() => { const slot = Array.isArray(booking.booking_slots) ? booking.booking_slots[0] : booking.booking_slots; return slot ? { ...slot, outlets: slot.outlets ? { ...slot.outlets, full_name: slot.outlets.name, name: outletShortName(slot.outlets.name) } : slot.outlets } : slot; })(),
  }));
  return apiOk({ items, pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) }, stats });
}
