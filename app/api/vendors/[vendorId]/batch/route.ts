import { type SupabaseClient } from '@supabase/supabase-js';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { vendorBatchSchema, type VendorBatch } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string }> }

function safe(value: string | undefined) {
  return (value || '').trim().replace(/[%(),]/g, ' ');
}

function relation<T>(value: T | T[] | null | undefined): T | null | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function voucherStatus(voucher: Record<string, unknown>) {
  const v = voucher as { valid_from?: string; valid_until?: string; is_active?: boolean; max_uses?: number; uses_count?: number };
  const now = Date.now();
  const validFrom = v.valid_from ? new Date(v.valid_from).getTime() : null;
  const validUntil = v.valid_until ? new Date(v.valid_until).getTime() : null;
  if (!v.is_active) return 'inactive';
  if (validFrom && validFrom > now) return 'scheduled';
  if (validUntil && validUntil < now) return 'expired';
  if (v.max_uses && v.uses_count !== undefined && v.uses_count >= v.max_uses) return 'expired';
  return 'active';
}

async function findFilteredIds(db: SupabaseClient, vendorId: string, input: VendorBatch, scopedOutletIds?: string[]) {
  const filters = input.filters || {};
  const q = safe(filters.q as string | undefined);

  if (input.entity === 'products') {
    let query = db.from('products').select('id,name,slug').eq('vendor_id', vendorId);
    if (scopedOutletIds) query = query.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    if (filters.productType) query = query.eq('product_type', filters.productType);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.outletId) query = query.eq('outlet_id', filters.outletId);
    if (q) query = query.or('name.ilike.%' + q + '%,slug.ilike.%' + q + '%');
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((item: { id: string }) => item.id);
  }

  if (input.entity === 'outlets') {
    let query = db.from('outlets').select('id,name,city').eq('vendor_id', vendorId);
    if (scopedOutletIds) query = query.in('id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.status) query = query.eq('status', filters.status);
    if (q) query = query.or('name.ilike.%' + q + '%,city.ilike.%' + q + '%');
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((item: { id: string }) => item.id);
  }

  if (input.entity === 'vouchers') {
    let query = db.from('vouchers').select('id,code,name,is_active,valid_from,valid_until,max_uses,uses_count').eq('vendor_id', vendorId);
    if (q) query = query.or('code.ilike.%' + q + '%,name.ilike.%' + q + '%');
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter((item: { id: string; status?: string; [key: string]: unknown }) => !filters.status || voucherStatus(item) === filters.status).map((item: { id: string }) => item.id);
  }

  if (input.entity === 'slots') {
    const outletIds = scopedOutletIds ?? ((await db.from('outlets').select('id').eq('vendor_id', vendorId)).data || []).map((item: { id: string }) => item.id);
    let query = db.from('booking_slots').select('id,product_id,outlet_id,starts_at,status,products(name),outlets(name,city)').in('outlet_id', outletIds.length ? outletIds : ['none']);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.outletId) query = query.eq('outlet_id', filters.outletId);
    if (filters.productId) query = query.eq('product_id', filters.productId);
    if (filters.from) query = query.gte('starts_at', filters.from);
    if (filters.to) query = query.lte('starts_at', filters.to + 'T23:59:59.999Z');
    const { data, error } = await query;
    if (error) throw error;
    const searchTerm = q.toLowerCase();
    return (data || []).filter((item: { id: string; products: { name: string } | { name: string }[] | null; outlets: { name: string; city: string } | { name: string; city: string }[] | null }) => !searchTerm || [item.id, relation(item.products)?.name, relation(item.outlets)?.name, relation(item.outlets)?.city].some((value) => String(value || '').toLowerCase().includes(searchTerm))).map((item: { id: string }) => item.id);
  }

  if (input.entity === 'orders') {
    let orderQuery = db.from('order_items').select('id,order_id,product_name,variant_name,fulfil_status,created_at,outlet_id,orders!inner(status,users(full_name,email))').eq('vendor_id', vendorId);
    if (scopedOutletIds) orderQuery = orderQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    const { data, error } = await orderQuery;
    if (error) throw error;
    const searchTerm = ((filters.q as string) || '').toLowerCase().replace(/^#/, '');
    return (data || []).filter((item: { id: string; order_id: string; product_name: string; variant_name: string; fulfil_status: string; created_at: string; outlet_id: string; orders: unknown }) => {
      const order = relation(item.orders) as { status: string; users: unknown } | null;
      const customer = relation(order?.users) as { full_name: string; email: string } | null;
      const matchesQ = !searchTerm || [item.id, item.order_id, item.product_name, item.variant_name, customer?.full_name, customer?.email].some((value) => String(value || '').toLowerCase().includes(searchTerm));
      const matchesFulfil = !filters.fulfilStatus || item.fulfil_status === filters.fulfilStatus;
      const matchesOrder = !filters.orderStatus || order?.status === filters.orderStatus;
      const created = item.created_at ? new Date(item.created_at).getTime() : 0;
      const from = filters.from ? new Date(filters.from as string).getTime() : null;
      const to = filters.to ? new Date((filters.to as string) + 'T23:59:59.999Z').getTime() : null;
      return matchesQ && matchesFulfil && matchesOrder && (!from || created >= from) && (!to || created <= to);
    }).map((item: { id: string }) => item.id);
  }

  const outletIds = scopedOutletIds ?? ((await db.from('outlets').select('id').eq('vendor_id', vendorId)).data || []).map((item: { id: string }) => item.id);
  if (!outletIds.length) return [];
  const { data: slots, error: slotError } = await db.from('booking_slots').select('id,starts_at').in('outlet_id', outletIds);
  if (slotError) throw slotError;
  const slotIds = (slots || []).map((item: { id: string }) => item.id);
  if (!slotIds.length) return [];
  let query = db.from('bookings').select('id,status,customer_id,users(full_name,email),order_items(product_name),booking_slots(starts_at)').in('slot_id', slotIds);
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const searchTerm = ((filters.q as string) || '').toLowerCase().replace(/^#/, '');
  const from = filters.from ? new Date(filters.from as string).getTime() : null;
  const to = filters.to ? new Date((filters.to as string) + 'T23:59:59.999Z').getTime() : null;
  return (data || []).filter((item: { id: string; users: unknown; order_items: unknown; booking_slots: unknown }) => {
    const customer = relation(item.users) as { full_name: string; email: string } | null;
    const orderItem = relation(item.order_items) as { product_name: string } | null;
    const slot = relation(item.booking_slots) as { starts_at: string } | null;
    const starts = slot?.starts_at ? new Date(slot.starts_at).getTime() : 0;
    const matchesQ = !searchTerm || [item.id, customer?.full_name, customer?.email, orderItem?.product_name].some((value) => String(value || '').toLowerCase().includes(searchTerm));
    return matchesQ && (!from || starts >= from) && (!to || starts <= to);
  }).map((item: { id: string }) => item.id);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, vendorBatchSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  if (access.access.isOutletManager && !['products', 'orders', 'bookings', 'slots'].includes(input.entity)) {
    return apiFail('FORBIDDEN', 'Outlet Managers can only batch-update products, bookings, orders, and availability', 403);
  }
  const db = access.access.serviceDb;
  const scopedOutletIds = access.access.isOutletManager ? access.access.outletIds : undefined;
  let scopedSlotIds: string[] | undefined;
  if (scopedOutletIds) {
    const { data: slots, error } = await db.from('booking_slots').select('id').in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    if (error) return apiFail('DB_ERROR', error.message, 500);
    scopedSlotIds = (slots || []).map((item: { id: string }) => item.id);
  }
  let targetIds = input.selectAllFiltered ? await findFilteredIds(db, vendorId, input, scopedOutletIds) : input.ids;
  targetIds = [...new Set(targetIds)];
  if (!targetIds.length) return apiOk({ entity: input.entity, action: input.action, requested: 0, updated: 0, skipped: 0 });

  let updatedIds: string[] = [];
  let skippedIds: string[] = [];

  if (input.entity === 'products') {
    const status = input.action === 'archive' ? 'archived' : input.action === 'restore' ? 'active' : null;
    if (!status) return apiFail('INVALID_ACTION', 'Products support archive or restore only', 400);
    let updateQuery = db.from('products').update({ status }).eq('vendor_id', vendorId).in('id', targetIds);
    if (scopedOutletIds) updateQuery = updateQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    const { data, error } = await updateQuery.select('id');
    if (error) return apiFail('DB_ERROR', error.message, 500);
    updatedIds = (data || []).map((item: { id: string }) => item.id);
  } else if (input.entity === 'outlets') {
    const status = input.action === 'close' ? 'closed' : input.action === 'activate' ? 'active' : null;
    if (!status) return apiFail('INVALID_ACTION', 'Outlets support close or activate only', 400);
    const { data, error } = await db.from('outlets').update({ status }).eq('vendor_id', vendorId).in('id', targetIds).select('id');
    if (error) return apiFail('DB_ERROR', error.message, 500);
    updatedIds = (data || []).map((item: { id: string }) => item.id);
  } else if (input.entity === 'vouchers') {
    const isActive = input.action === 'activate' ? true : input.action === 'deactivate' ? false : null;
    if (isActive === null) return apiFail('INVALID_ACTION', 'Vouchers support activate or deactivate only', 400);
    const { data, error } = await db.from('vouchers').update({ is_active: isActive }).eq('vendor_id', vendorId).in('id', targetIds).select('id');
    if (error) return apiFail('DB_ERROR', error.message, 500);
    updatedIds = (data || []).map((item: { id: string }) => item.id);
  } else if (input.entity === 'orders') {
    if (!['ready', 'fulfilled'].includes(input.action)) return apiFail('INVALID_ACTION', 'Orders support ready or fulfilled only', 400);
    let itemQuery = db.from('order_items').select('id,order_id,fulfil_status,orders!inner(status)').eq('vendor_id', vendorId).in('id', targetIds);
    if (scopedOutletIds) itemQuery = itemQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    const { data: items, error } = await itemQuery;
    if (error) return apiFail('DB_ERROR', error.message, 500);
    const valid = (items || []).filter((item: { id: string; orders: unknown; fulfil_status: string }) => {
      const orderStatus = (relation(item.orders) as { status: string } | null)?.status;
      return ['paid', 'completed'].includes(orderStatus || '') && (input.action === 'ready' ? ['pending'].includes(item.fulfil_status) : ['pending', 'ready'].includes(item.fulfil_status));
    }).map((item: { id: string }) => item.id);
    skippedIds = targetIds.filter((id: string) => !valid.includes(id));
    const updateData: Record<string, unknown> = { fulfil_status: input.action };
    if (input.action === 'fulfilled') updateData.fulfilled_at = new Date().toISOString();
    if (valid.length) {
      let updateQuery = db.from('order_items').update(updateData).in('id', valid);
      if (scopedOutletIds) updateQuery = updateQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
      const { data, error: updateError } = await updateQuery.select('id');
      if (updateError) return apiFail('DB_ERROR', updateError.message, 500);
      updatedIds = (data || []).map((item: { id: string }) => item.id);
    }
  } else if (input.entity === 'bookings') {
    if (!['check_in', 'cancel'].includes(input.action)) return apiFail('INVALID_ACTION', 'Bookings support check-in or cancel only', 400);
    let bookingQuery = db.from('bookings').select('id,status,order_item_id,slot_id').in('id', targetIds);
    if (scopedSlotIds) bookingQuery = bookingQuery.in('slot_id', scopedSlotIds.length ? scopedSlotIds : ['none']);
    const { data: bookings, error } = await bookingQuery;
    if (error) return apiFail('DB_ERROR', error.message, 500);
    const valid = (bookings || []).filter((item: { id: string; status: string }) => input.action === 'check_in' ? item.status === 'confirmed' : item.status === 'confirmed').map((item: { id: string }) => item.id);
    skippedIds = targetIds.filter((id: string) => !valid.includes(id));
    if (valid.length) {
      const updateData = input.action === 'check_in' ? { status: 'checked_in', check_in_at: new Date().toISOString() } : { status: 'cancelled', cancelled_at: new Date().toISOString() };
      let updateQuery = db.from('bookings').update(updateData).in('id', valid);
      if (scopedSlotIds) updateQuery = updateQuery.in('slot_id', scopedSlotIds.length ? scopedSlotIds : ['none']);
      const { data, error: updateError } = await updateQuery.select('id,order_item_id');
      if (updateError) return apiFail('DB_ERROR', updateError.message, 500);
      updatedIds = (data || []).map((item: { id: string }) => item.id);
      const orderItemIds = (data || []).map((item: { order_item_id: string }) => item.order_item_id).filter(Boolean);
      if (input.action === 'check_in' && orderItemIds.length) await db.from('order_items').update({ fulfil_status: 'fulfilled', fulfilled_at: new Date().toISOString() }).in('id', orderItemIds);
    }
  } else {
    if (!['cancel', 'restore'].includes(input.action)) return apiFail('INVALID_ACTION', 'Slots support cancel or restore only', 400);
    const targetStatus = input.action === 'cancel' ? 'cancelled' : 'available';
    const validStatuses = input.action === 'cancel' ? ['available', 'full'] : ['cancelled'];
    let slotQuery = db.from('booking_slots').select('id,status,booked').in('id', targetIds);
    if (scopedOutletIds) slotQuery = slotQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
    const { data: slots, error } = await slotQuery;
    if (error) return apiFail('DB_ERROR', error.message, 500);
    const valid = (slots || []).filter((item: { id: string; status: string; booked: number }) => validStatuses.includes(item.status) && (input.action === 'cancel' ? true : item.booked === 0)).map((item: { id: string }) => item.id);
    skippedIds = targetIds.filter((id: string) => !valid.includes(id));
    if (valid.length) {
      let updateQuery = db.from('booking_slots').update({ status: targetStatus }).in('id', valid);
      if (scopedOutletIds) updateQuery = updateQuery.in('outlet_id', scopedOutletIds.length ? scopedOutletIds : ['none']);
      const { data, error: updateError } = await updateQuery.select('id');
      if (updateError) return apiFail('DB_ERROR', updateError.message, 500);
      updatedIds = (data || []).map((item: { id: string }) => item.id);
    }
  }

  return apiOk({ entity: input.entity, action: input.action, requested: targetIds.length, updated: updatedIds.length, skipped: skippedIds.length, skippedIds });
}
