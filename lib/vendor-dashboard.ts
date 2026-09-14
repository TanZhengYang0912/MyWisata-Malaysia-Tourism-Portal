import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { RecentOrder } from '@/components/vendor/recent-transactions';
import { outletLocation, outletShortName } from '@/lib/outlet-display';
import { isRatingEligibleProduct, isVisibleActiveProduct, resolveProductOutlet } from '@/lib/vendor/product-scope';
import { productImageUrl } from '@/lib/storage/product-image';

export type DashboardFilter = 'today' | '7d' | '30d' | '12m' | 'custom';
export type DashboardCustomRange = { from?: string; to?: string };

type DashboardRow = {
  id: string;
  order_id: string;
  outlet_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  line_total: number;
  fulfil_status: string;
  slot_id: string | null;
  slot_starts_at: string | null;
  created_at: string;
  status?: string;
  name?: string;
  city?: string | null;
  state?: string | null;
  cover_url?: string | null;
  product_type?: string | null;
  requires_booking?: boolean | null;
  rating?: number;
  orders?: { display_id?: string | null; status?: string | null };
};

type DashboardProduct = {
  id: string;
  name: string;
  status: string | null;
  outlet_id: string | null;
  cover_url?: string | null;
  product_type?: string | null;
  requires_booking?: boolean | null;
  outlet_offers?: Array<{ outlet_id: string; status?: string | null }> | null;
};

type RecentOrderDraft = RecentOrder & { display_id?: string | null; fulfil_statuses: string[] };
export type StockAlert = { variantId: string; productId: string; productName: string; variantName: string; outletId: string; quantity: number; reserved: number; available: number; threshold: number; coverUrl: string | null };

const TIME_ZONE = 'Asia/Kuala_Lumpur';

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parts(date: Date) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(values.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function malaysiaMidnight(date: Date) {
  const local = parts(date);
  return new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day)) - 8 * 60 * 60 * 1000);
}

function rangeFor(filter: DashboardFilter, customRange?: DashboardCustomRange) {
  const now = new Date();
  const today = malaysiaMidnight(now);
  let start = today;
  let end = now;
  if (filter === 'custom' && customRange?.from) {
    const from = new Date(`${customRange.from}T00:00:00+08:00`);
    const to = new Date(`${customRange.to || customRange.from}T23:59:59.999+08:00`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      start = from;
      end = to < now ? to : now;
    }
  }
  if (filter === '7d') start = new Date(today.getTime() - 6 * 86400000);
  if (filter === '30d') start = new Date(today.getTime() - 29 * 86400000);
  if (filter === '12m') {
    const local = parts(now);
    start = new Date(Date.UTC(Number(local.year), Number(local.month) - 11, 1) - 8 * 60 * 60 * 1000);
  }
  const duration = Math.max(1, end.getTime() - start.getTime());
  return { now: end, start, previousStart: new Date(start.getTime() - duration), previousEnd: start };
}

function bucketKey(date: Date, filter: DashboardFilter) {
  const local = parts(date);
  if (filter === 'today') return `${local.year}-${local.month}-${local.day}-${local.hour}`;
  if (filter === '12m') return `${local.year}-${local.month}`;
  return `${local.year}-${local.month}-${local.day}`;
}

function bucketLabel(key: string, filter: DashboardFilter) {
  const date = filter === 'today'
    ? new Date(`${key.slice(0, 10)}T${key.slice(11)}:00:00+08:00`)
    : filter === '12m'
      ? new Date(`${key}-01T00:00:00+08:00`)
      : new Date(`${key}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-MY', filter === 'today'
    ? { timeZone: TIME_ZONE, hour: 'numeric' }
    : filter === '12m'
      ? { timeZone: TIME_ZONE, month: 'short', year: '2-digit' }
      : { timeZone: TIME_ZONE, day: '2-digit', month: 'short' }).format(date);
}

function isRevenueItem(item: DashboardRow) {
  return ['paid', 'completed'].includes(item.orders?.status ?? '');
}

function sumRevenue(items: DashboardRow[]) {
  return items.reduce((total, item) => total + (isRevenueItem(item) ? number(item.line_total) : 0), 0);
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getVendorDashboardData(filter: DashboardFilter = '7d', customRange?: DashboardCustomRange) {
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return null;

  const { data: ownedVendors, error: vendorError } = await authDb
    .from('vendors').select('id,name,status').eq('owner_id', user.id).eq('status', 'approved').limit(1);
  if (vendorError) throw vendorError;
  let vendor = ownedVendors?.[0];
  let role: 'vendor_owner' | 'outlet_manager' = 'vendor_owner';
  let scopedOutletIds: string[] | null = null;

  if (!vendor) {
    const { data: assignments, error: assignmentError } = await authDb
      .from('outlet_managers')
      .select('outlet_id,outlets(vendor_id)')
      .eq('user_id', user.id);
    if (assignmentError) throw assignmentError;
    const managerAssignments = assignments || [];
    const managerVendorIds = [...new Set(managerAssignments.map((assignment: { outlets: { vendor_id: string } | { vendor_id: string }[]; outlet_id?: string }) => {
      const outlet = Array.isArray(assignment.outlets) ? assignment.outlets[0] : assignment.outlets;
      return outlet?.vendor_id;
    }).filter(Boolean))];
    const managerVendorId = managerVendorIds[0];
    if (managerVendorId) {
      const { data: managerVendors, error: managerVendorError } = await authDb
        .from('vendors').select('id,name,status').eq('id', managerVendorId).eq('status', 'approved').limit(1);
      if (managerVendorError) throw managerVendorError;
      vendor = managerVendors?.[0];
      role = 'outlet_manager';
      scopedOutletIds = managerAssignments.filter((assignment: { outlets: { vendor_id: string } | { vendor_id: string }[]; outlet_id?: string }) => {
        const outlet = Array.isArray(assignment.outlets) ? assignment.outlets[0] : assignment.outlets;
        return outlet?.vendor_id === managerVendorId && assignment.outlet_id;
      }).map((assignment: { outlet_id: string }) => assignment.outlet_id);
    }
  }
  if (!vendor) return null;

  // The checked-in orders RLS policy joins back to order_items. Querying the
  // two tables through the anon session triggers Postgres policy recursion.
  // Ownership is verified above with the user session; this server-only
  // service client is then restricted to that verified vendor scope.
  const db = createServiceClient();

  const { data: outlets, error: outletError } = await db
    .from('outlets').select('id,name,city,state,status').eq('vendor_id', vendor.id).order('name');
  if (outletError) throw outletError;
  const outletRows = ((scopedOutletIds ? (outlets || []).filter((outlet: { id: string }) => scopedOutletIds?.includes(outlet.id)) : outlets || [])) as unknown as DashboardRow[];
  const outletIds = outletRows.map((outlet) => outlet.id);
  const { now, start, previousStart, previousEnd } = rangeFor(filter, customRange);

  const [itemsResult, productsResult, reviewsResult, pendingResult, inventoryResult] = await Promise.all([
    outletIds.length
      ? db.from('order_items').select('id,order_id,outlet_id,product_id,product_name,quantity,line_total,fulfil_status,slot_id,slot_starts_at,created_at,orders!inner(display_id,status,total_amount,created_at,paid_at,completed_at)').in('outlet_id', outletIds).gte('created_at', previousStart.toISOString()).lte('created_at', now.toISOString()).order('created_at', { ascending: false }).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    outletIds.length
      ? db.from('products').select('id,name,base_price,product_type,status,outlet_id,cover_url,outlet_offers(outlet_id,status)').eq('vendor_id', vendor.id).or(`outlet_id.in.(${outletIds.join(',')}),outlet_id.is.null`)
      : Promise.resolve({ data: [], error: null }),
    db.from('reviews').select('product_id,rating,created_at').eq('vendor_id', vendor.id).eq('is_visible', true).gte('created_at', start.toISOString()).lte('created_at', now.toISOString()),
    outletIds.length
      ? db.from('order_items').select('order_id,orders!inner(status)').in('outlet_id', outletIds).in('fulfil_status', ['pending', 'ready']).eq('orders.status', 'paid')
      : Promise.resolve({ data: [], error: null }),
    db.from('inventory').select('variant_id,quantity,reserved,low_stock_threshold,product_variants!inner(id,name,product_id,products!inner(id,name,outlet_id,cover_url,outlet_offers(outlet_id,status)))'),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (inventoryResult.error) throw inventoryResult.error;

  const allItems = (itemsResult.data || []) as DashboardRow[];
  const currentItems = allItems.filter((item) => new Date(item.created_at) >= start);
  const previousItems = allItems.filter((item) => new Date(item.created_at) >= previousStart && new Date(item.created_at) < previousEnd);
  const currentOrderIds = new Set(currentItems.map((item) => item.order_id));
  const pendingOrdersCount = new Set((pendingResult.data || []).map((item: { order_id: string }) => item.order_id)).size;
  const previousOrderIds = new Set(previousItems.map((item) => item.order_id));
  const products = (productsResult.data || []) as unknown as DashboardProduct[];
  const reviews = (reviewsResult.data || []) as unknown as DashboardRow[];
  const outletNames = Object.fromEntries(outletRows.map((outlet) => [outlet.id, outlet.name]));
  // Strip the vendor brand prefix from each outlet name to get a unique location label.
  // e.g. "Rasa Malaysia — Ipoh Old Town" → "Ipoh Old Town"
  // Falls back to city or the full name if no dash separator is found.
  const rawShortNames = outletRows.map((outlet) => ({ id: outlet.id, shortName: outletShortName(outlet.name, vendor.name) }));
  // Disambiguate duplicates: if two outlets resolve to the same label, append (2), (3) …
  const seenCounts = new Map<string, number>();
  const outletShortNames = Object.fromEntries(
    rawShortNames.map(({ id, shortName }) => {
      const count = (seenCounts.get(shortName) ?? 0) + 1;
      seenCounts.set(shortName, count);
      return [id, count === 1 ? shortName : `${shortName} (${count})`];
    }),
  );
  const outletLocations = Object.fromEntries(outletRows.map((outlet) => [outlet.id, outletLocation(outlet.city, outlet.state)]));
  const productNames = Object.fromEntries(products.map((product) => [product.id, product.name]));
  const productById = Object.fromEntries(products.map((product) => [product.id, product]));
  const productOutletIds = Object.fromEntries(products.flatMap((product) => {
    const outlet = resolveProductOutlet(product, outletIds);
    return outlet ? [[product.id, outlet.id]] : [];
  }));
  const stockAlerts = ((inventoryResult.data || []) as Array<{ product_variants: unknown; quantity: number | string | null; reserved: number | string | null; low_stock_threshold: number | string | null; variant_id: string }>).flatMap((row) => {
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products;
    const resolvedOutlet = product ? resolveProductOutlet(product, outletIds) : null;
    if (!variant || !product || !resolvedOutlet) return [];
    const quantity = number(row.quantity);
    const reserved = number(row.reserved);
    const available = Math.max(0, quantity - reserved);
    const threshold = Math.max(0, number(row.low_stock_threshold ?? 5));
    return available <= threshold ? [{ variantId: row.variant_id, productId: product.id, productName: product.name, variantName: variant.name, outletId: resolvedOutlet.id, quantity, reserved, available, threshold, coverUrl: productImageUrl(product.cover_url) || null }] : [];
  }).sort((a, b) => a.available - b.available).slice(0, 12) as StockAlert[];

  const chartMap = new Map<string, { revenue: number; orders: Set<string> }>();
  for (const item of currentItems) {
    const key = bucketKey(new Date(item.created_at), filter);
    const point = chartMap.get(key) || { revenue: 0, orders: new Set<string>() };
    if (isRevenueItem(item)) point.revenue += number(item.line_total);
    point.orders.add(item.order_id);
    chartMap.set(key, point);
  }
  const chart = [...chartMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, point]) => ({
    label: bucketLabel(key, filter), revenue: Math.round(point.revenue * 100) / 100, orders: point.orders.size,
  }));

  const outletMap = new Map<string, number>();
  for (const item of currentItems) if (isRevenueItem(item)) outletMap.set(item.outlet_id, (outletMap.get(item.outlet_id) || 0) + number(item.line_total));
  const salesByOutlet = [...outletMap.entries()].sort(([, a], [, b]) => b - a).map(([outletId, revenue], index) => ({
    name: outletShortNames[outletId] || outletNames[outletId] || 'Unknown outlet', fullName: outletNames[outletId] || 'Unknown outlet', revenue: Math.round(revenue * 100) / 100, color: ['#010066', '#1d2a8a', '#b45309', '#be123c', '#7c3aed'][index % 5],
  }));

  const productMap = new Map<string, { name: string; quantity: number; revenue: number; coverUrl: string | null; outletName: string }>();
  for (const item of currentItems) {
    const key = item.product_id || item.product_name;
    const product = productMap.get(key) || { name: item.product_name, quantity: 0, revenue: 0, coverUrl: productImageUrl(productById[key]?.cover_url) || null, outletName: outletShortNames[item.outlet_id] || outletNames[item.outlet_id] || 'Unknown outlet' };
    product.quantity += number(item.quantity);
    if (isRevenueItem(item)) product.revenue += number(item.line_total);
    productMap.set(key, product);
  }
  const topSelling = [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5).map((product) => ({ ...product, revenue: Math.round(product.revenue * 100) / 100 }));

  const ratingMap = new Map<string, { total: number; count: number }>();
  for (const review of reviews) {
    const key = review.product_id;
    if (!key) continue;
    const product = productById[key];
    if (!product || !isRatingEligibleProduct(product, outletIds)) continue;
    const rating = ratingMap.get(key) || { total: 0, count: 0 };
    rating.total += number(review.rating);
    rating.count += 1;
    ratingMap.set(key, rating);
  }
  const topRated = [...ratingMap.entries()].sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count) || b.count - a.count).slice(0, 5).map(([productId, rating]) => ({
    name: productNames[productId] || 'Unnamed experience', coverUrl: productImageUrl(productById[productId]?.cover_url) || null, rating: Math.round((rating.total / rating.count) * 10) / 10, reviews: rating.count, outletName: outletShortNames[productOutletIds[productId] || ''] || 'Unknown outlet',
  }));

  const recentOrderMap = new Map<string, RecentOrderDraft>();
  for (const item of currentItems) {
    const itemWithNames = { ...item, outlet_name: outletShortNames[item.outlet_id] || outletNames[item.outlet_id] || 'Unknown outlet', outlet_location: outletLocations[item.outlet_id] || 'Malaysia', order_status: item.orders?.status || 'unknown' };
    if (!recentOrderMap.has(item.order_id)) {
      recentOrderMap.set(item.order_id, { order_id: item.order_id, display_id: item.orders?.display_id, created_at: item.created_at, order_status: itemWithNames.order_status, order_total: 0, quantity: 0, item_count: 0, product_name: item.product_name, outlet_name: itemWithNames.outlet_name, outlet_id: item.outlet_id, outlet_location: itemWithNames.outlet_location, fulfil_status: 'pending', fulfil_statuses: [], items: [] });
    }
    const order = recentOrderMap.get(item.order_id)!;
    order.created_at = new Date(item.created_at) > new Date(order.created_at) ? item.created_at : order.created_at;
    order.order_total += number(item.line_total);
    order.quantity += number(item.quantity);
    order.item_count += 1;
    order.fulfil_statuses.push(item.fulfil_status);
    order.items.push({ id: item.id, product_name: item.product_name, quantity: item.quantity, line_total: item.line_total, fulfil_status: item.fulfil_status, outlet_name: itemWithNames.outlet_name, outlet_id: item.outlet_id, outlet_location: itemWithNames.outlet_location });
  }
  const recentTransactions = [...recentOrderMap.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((order) => ({
      ...order,
      product_name: order.item_count > 1 ? order.product_name + ' + ' + (order.item_count - 1) + ' more' : order.product_name,
      fulfil_status: order.fulfil_statuses.includes('pending') ? 'pending' : order.fulfil_statuses.includes('ready') ? 'ready' : order.fulfil_statuses.every((status) => status === 'fulfilled') ? 'fulfilled' : order.fulfil_statuses[0] || 'pending',
    }));
  const totalRevenue = sumRevenue(currentItems);
  const previousRevenue = sumRevenue(previousItems);
  const activeProducts = products.filter((product) => isVisibleActiveProduct(product, outletIds)).length;
  const activeOutlets = outletRows.filter((outlet) => outlet.status === 'active').length;
  const bookingItems = currentItems.filter((item) => item.slot_id || item.slot_starts_at).length;
  const totalOutletSales = salesByOutlet.reduce((total, outlet) => total + outlet.revenue, 0);

  const salesByProduct = [...productMap.entries()]
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([, product], index) => ({
      name: product.name,
      revenue: Math.round(product.revenue * 100) / 100,
      color: ['#010066', '#1d2a8a', '#b45309', '#be123c', '#7c3aed'][index % 5],
    }));
  const totalProductSales = salesByProduct.reduce((total, product) => total + product.revenue, 0);

  return {
    vendor,
    role,
    outletId: role === 'outlet_manager' ? outletIds[0] || null : null,
    filter,
    range: { start: start.toISOString(), end: now.toISOString() },
    stats: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: currentOrderIds.size,
      pendingOrders: pendingOrdersCount,
      activeProducts,
      activeOutlets,
      bookingItems,
      revenueGrowth: percentChange(totalRevenue, previousRevenue),
      ordersGrowth: percentChange(currentOrderIds.size, previousOrderIds.size),
    },
    chart,
    salesByOutlet,
    totalOutletSales: Math.round(totalOutletSales * 100) / 100,
    salesByProduct,
    totalProductSales: Math.round(totalProductSales * 100) / 100,
    topSelling,
    topRated,
    recentTransactions,
    stockAlerts,
  };
}

export function formatGrowth(value: number) {
  return `${value >= 0 ? '+' : ''}${value}% vs previous period`;
}
