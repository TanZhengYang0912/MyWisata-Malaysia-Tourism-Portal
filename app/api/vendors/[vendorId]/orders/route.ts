// P2 — Member 2: Vendor order items view (B4)
// GET /api/vendors/[vendorId]/orders


import { apiOk, apiFail } from '@/lib/validation/schemas';
import { outletShortName } from '@/lib/outlet-display';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { postgrestSearchTerm } from '@/lib/validation/postgrest-filter';
import { malaysiaCalendarDateToIso } from '@/lib/datetime/malaysia';
import type { StayBookingDetails } from '@/backend/core/types';

interface Props { params: Promise<{ vendorId: string }> }

const SEARCH_ID_LIMIT = 200;

/** null = not supplied; undefined = supplied but not a valid calendar date. */
function calendarDateParam(value: string | null): string | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const url = new URL(request.url);
  const fulfilStatus = url.searchParams.get('fulfil_status');
  const orderStatus = url.searchParams.get('order_status');
  const rawQ = (url.searchParams.get('q') || '').trim();
  const q = postgrestSearchTerm(rawQ);
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '10', 10) || 10));
  // The filter sends Malaysia calendar dates (YYYY-MM-DD). Compare against the
  // whole Malaysia day so orders placed on the "to" date are included, instead
  // of letting Postgres read a bare date as UTC midnight.
  const fromDate = calendarDateParam(url.searchParams.get('from'));
  const toDate = calendarDateParam(url.searchParams.get('to'));
  if (fromDate === undefined || toDate === undefined) return apiFail('INVALID_DATE', 'Use YYYY-MM-DD dates for the order date range', 422);
  if (fromDate && toDate && toDate < fromDate) return apiFail('INVALID_DATE_RANGE', 'The end date must be on or after the start date', 422);
  const from = fromDate ? malaysiaCalendarDateToIso(fromDate, 'start') : null;
  const to = toDate ? malaysiaCalendarDateToIso(toDate, 'end') : null;
  const linkedOrderId = url.searchParams.get('orderId');

  const access = await authorizeVendor(vendorId, undefined, { requireApproved: true });
  if (!access.ok) return access.response;
  if (linkedOrderId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkedOrderId)) {
    return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });
  }


  const supabase = access.access.serviceDb;

  // Get vendor outlets
  const outletIds = access.access.outletIds;

  if (!outletIds.length) return apiOk({ items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } });

  let query = supabase
    .from('orders')
    .select(`
      id, display_id, user_id, contact_name, contact_email, status, paid_at, completed_at, created_at,
      users(full_name, email),
      order_items!inner(
        id, order_id, product_name, variant_name, slot_starts_at, nights, quantity, line_total, fulfil_status, food_fulfilment_mode, food_qr_scanned_at, created_at, vendor_id, stay_details,
        outlets(id, name, city, state),
        products(cover_url, categories(slug))
      )
    `, { count: 'exact' })
    .eq('order_items.vendor_id', vendorId)
    .in('order_items.outlet_id', outletIds)
    .order('created_at', { ascending: false });

  if (linkedOrderId) query = query.eq('id', linkedOrderId);

  if (fulfilStatus === 'attention') {
    query = query.in('order_items.fulfil_status', ['pending', 'ready']);
  } else if (fulfilStatus) {
    query = query.eq('order_items.fulfil_status', fulfilStatus);
  }
  if (orderStatus && orderStatus !== 'all') query = query.eq('status', orderStatus);
  if (q) {
    // The database matches product names and is scoped to this vendor's
    // outlets, instead of loading up to 10,000 order items to filter here.
    // ponytail: matching order IDs are capped (they travel in one id.in.(...)
    // filter, which must stay a sane URL length); a broader search returns the
    // newest SEARCH_ID_LIMIT matches. Move to a search RPC if vendors need more.
    const pattern = `%${q}%`;
    const [{ data: itemMatches }, { data: matchingUsers }, { data: matchingOrders }] = await Promise.all([
      supabase.from('order_items').select('order_id').eq('vendor_id', vendorId).in('outlet_id', outletIds)
        .or(`product_name.ilike.${pattern},variant_name.ilike.${pattern}`)
        .order('created_at', { ascending: false }).limit(SEARCH_ID_LIMIT),
      supabase.from('users').select('id').or(`full_name.ilike.${pattern},email.ilike.${pattern}`).limit(100),
      supabase.from('orders').select('id').ilike('display_id', pattern).limit(100),
    ]);
    const matchingOrderIds = [
      ...(itemMatches || []).map((item: { order_id: string }) => item.order_id),
      ...(matchingOrders || []).map((item: { id: string }) => item.id),
    ];
    const userIds = (matchingUsers || []).map((item: { id: string }) => item.id);
    if (userIds.length) {
      // Only this vendor's orders from the matching customers.
      const { data: userOrders } = await supabase.from('orders').select('id, order_items!inner(vendor_id)')
        .in('user_id', userIds).eq('order_items.vendor_id', vendorId)
        .order('created_at', { ascending: false }).limit(SEARCH_ID_LIMIT);
      matchingOrderIds.push(...(userOrders || []).map((item: { id: string }) => item.id));
    }
    const conditions = [`contact_name.ilike.${pattern}`, `contact_email.ilike.${pattern}`];
    const orderIds = [...new Set(matchingOrderIds)].slice(0, SEARCH_ID_LIMIT);
    if (orderIds.length) conditions.push(`id.in.(${orderIds.join(',')})`);
    query = query.or(conditions.join(','));
  }
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const items = (data ?? []).map((order: { order_items: Array<{ vendor_id: string; fulfil_status: string; line_total: number | string | null; outlets: { id?: string; name: string; } | { id?: string; name: string; }[] | null; quantity: number; product_name: string; stay_details?: StayBookingDetails | null; products?: { categories?: { slug: string } | { slug: string }[] | null } | { categories?: { slug: string } | { slug: string }[] | null }[] | null }>; [key: string]: unknown; }) => {
    // Defense in depth: never return another vendor's item or an outlet outside this user's scope.
    const vendorItems = (order.order_items || []).filter((item) => {
      const outlet = Array.isArray(item.outlets) ? item.outlets[0] : item.outlets;
      return item.vendor_id === vendorId && Boolean(outlet?.id && outletIds.includes(outlet.id));
    }).map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
      // Guest details are meaningful only for accommodation and must not leak
      // through malformed non-stay order-item snapshots.
      return category?.slug === 'accommodation' ? item : { ...item, stay_details: null };
    });
    const total = vendorItems.reduce((sum: number, item: { line_total: number | string | null }) => sum + Number(item.line_total || 0), 0);
    const uniqueOutlets = [...new Set(vendorItems.map((item: { outlets: { name: string; } | { name: string; }[] | null }) => { const outletName = Array.isArray(item.outlets) ? item.outlets[0]?.name : item.outlets?.name; return outletName ? outletShortName(outletName) : null; }).filter(Boolean))];

    let fulfil_status = 'pending';
    if (vendorItems.length > 0) {
      if (vendorItems.every((item: { fulfil_status: string }) => item.fulfil_status === 'fulfilled')) fulfil_status = 'fulfilled';
      else if (vendorItems.every((item: { fulfil_status: string }) => item.fulfil_status === 'cancelled')) fulfil_status = 'cancelled';
      else if (vendorItems.every((item: { fulfil_status: string }) => item.fulfil_status === 'ready' || item.fulfil_status === 'fulfilled')) fulfil_status = 'ready';
    }

    return {
      ...order,
      // Do not leak the unfiltered nested relation through the spread above.
      order_items: vendorItems,
      users: order.users ?? { full_name: order.contact_name ?? "Guest", email: order.contact_email ?? null },
      vendor_total: total,
      vendor_items: vendorItems,
      outlets_summary: uniqueOutlets.length > 1 ? 'Multiple outlets' : (uniqueOutlets[0] || 'Unknown outlet'),
      vendor_fulfil_status: fulfil_status,
      // Provide a product summary string
      product_summary: vendorItems.map((i: { quantity: number; product_name: string }) => `${i.quantity}x ${i.product_name}`).join(', ')
    };
  });

  return apiOk({ items, pagination: { page, pageSize, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) } });
}
