import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { RecentOrder } from '@/components/vendor/recent-transactions';

export type DashboardFilter = 'today' | '7d' | '30d' | '12m';

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
  cover_url?: string | null;
  product_type?: string | null;
  requires_booking?: boolean | null;
  rating?: number;
  orders?: { status?: string | null };
};

type RecentOrderDraft = RecentOrder & { fulfil_statuses: string[] };

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

function rangeFor(filter: DashboardFilter) {
  const now = new Date();
  const today = malaysiaMidnight(now);
  let start = today;
  if (filter === '7d') start = new Date(today.getTime() - 6 * 86400000);
  if (filter === '30d') start = new Date(today.getTime() - 29 * 86400000);
  if (filter === '12m') {
    const local = parts(now);
    start = new Date(Date.UTC(Number(local.year), Number(local.month) - 11, 1) - 8 * 60 * 60 * 1000);
  }
  const duration = now.getTime() - start.getTime();
  return { now, start, previousStart: new Date(start.getTime() - duration), previousEnd: start };
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

export async function getVendorDashboardData(filter: DashboardFilter = '7d') {
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return null;

  const { data: vendors, error: vendorError } = await authDb
    .from('vendors').select('id,name,status').eq('owner_id', user.id).eq('status', 'approved').limit(1);
  if (vendorError) throw vendorError;
  const vendor = vendors?.[0];
  if (!vendor) return null;

  // The checked-in orders RLS policy joins back to order_items. Querying the
  // two tables through the anon session triggers Postgres policy recursion.
  // Ownership is verified above with the user session; this server-only
  // service client is then restricted to that verified vendor scope.
  const db = createServiceClient();

  const { data: outlets, error: outletError } = await db
    .from('outlets').select('id,name,city,state,status').eq('vendor_id', vendor.id).order('name');
  if (outletError) throw outletError;
  const outletRows = (outlets || []) as unknown as DashboardRow[];
  const outletIds = outletRows.map((outlet) => outlet.id);
  const { now, start, previousStart, previousEnd } = rangeFor(filter);

  const [itemsResult, productsResult, reviewsResult] = await Promise.all([
    outletIds.length
      ? db.from('order_items').select('id,order_id,outlet_id,product_id,product_name,quantity,line_total,fulfil_status,slot_id,slot_starts_at,created_at,orders!inner(status,total_amount,created_at,paid_at,completed_at)').in('outlet_id', outletIds).gte('created_at', previousStart.toISOString()).lte('created_at', now.toISOString()).order('created_at', { ascending: false }).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    db.from('products').select('id,name,base_price,product_type,status,outlet_id,cover_url').eq('vendor_id', vendor.id),
    db.from('reviews').select('product_id,rating,created_at').eq('vendor_id', vendor.id).eq('is_visible', true),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;

  const allItems = (itemsResult.data || []) as DashboardRow[];
  const currentItems = allItems.filter((item) => new Date(item.created_at) >= start);
  const previousItems = allItems.filter((item) => new Date(item.created_at) >= previousStart && new Date(item.created_at) < previousEnd);
  const currentOrderIds = new Set(currentItems.map((item) => item.order_id));
  const previousOrderIds = new Set(previousItems.map((item) => item.order_id));
  const products = (productsResult.data || []) as unknown as DashboardRow[];
  const reviews = (reviewsResult.data || []) as unknown as DashboardRow[];
  const outletNames = Object.fromEntries(outletRows.map((outlet) => [outlet.id, outlet.name]));
  // Strip the vendor brand prefix from each outlet name to get a unique location label.
  // e.g. "Rasa Malaysia — Ipoh Old Town" → "Ipoh Old Town"
  // Falls back to city or the full name if no dash separator is found.
  const vendorPrefix = `${vendor.name} — `;
  const rawShortNames = outletRows.map((outlet) => {
    const name: string = outlet.name || '';
    const shortName = name.startsWith(vendorPrefix)
      ? name.slice(vendorPrefix.length).trim()
      : (outlet.city as string) || name;
    return { id: outlet.id, shortName };
  });
  // Disambiguate duplicates: if two outlets resolve to the same label, append (2), (3) …
  const seenCounts = new Map<string, number>();
  const outletShortNames = Object.fromEntries(
    rawShortNames.map(({ id, shortName }) => {
      const count = (seenCounts.get(shortName) ?? 0) + 1;
      seenCounts.set(shortName, count);
      return [id, count === 1 ? shortName : `${shortName} (${count})`];
    }),
  );
  const productNames = Object.fromEntries(products.map((product) => [product.id, product.name]));
  const productById = Object.fromEntries(products.map((product) => [product.id, product]));

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
    name: outletShortNames[outletId] || outletNames[outletId] || 'Unknown outlet', fullName: outletNames[outletId] || 'Unknown outlet', revenue: Math.round(revenue * 100) / 100, color: ['#0f766e', '#0e7490', '#b45309', '#be123c', '#7c3aed'][index % 5],
  }));

  const productMap = new Map<string, { name: string; quantity: number; revenue: number; coverUrl: string | null }>();
  for (const item of currentItems) {
    const key = item.product_id || item.product_name;
    const product = productMap.get(key) || { name: item.product_name, quantity: 0, revenue: 0, coverUrl: productById[key]?.cover_url || null };
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
    if (!product || (!product.requires_booking && !['activity', 'experience'].includes(product.product_type ?? ''))) continue;
    const rating = ratingMap.get(key) || { total: 0, count: 0 };
    rating.total += number(review.rating);
    rating.count += 1;
    ratingMap.set(key, rating);
  }
  const topRated = [...ratingMap.entries()].sort(([, a], [, b]) => (b.total / b.count) - (a.total / a.count) || b.count - a.count).slice(0, 5).map(([productId, rating]) => ({
    name: productNames[productId] || 'Unnamed experience', coverUrl: productById[productId]?.cover_url || null, rating: Math.round((rating.total / rating.count) * 10) / 10, reviews: rating.count,
  }));

  const recentOrderMap = new Map<string, RecentOrderDraft>();
  for (const item of currentItems) {
    const itemWithNames = { ...item, outlet_name: outletNames[item.outlet_id] || 'Unknown outlet', order_status: item.orders?.status || 'unknown' };
    if (!recentOrderMap.has(item.order_id)) {
      recentOrderMap.set(item.order_id, { order_id: item.order_id, created_at: item.created_at, order_status: itemWithNames.order_status, order_total: 0, quantity: 0, item_count: 0, product_name: item.product_name, outlet_name: itemWithNames.outlet_name, fulfil_status: 'pending', fulfil_statuses: [], items: [] });
    }
    const order = recentOrderMap.get(item.order_id)!;
    order.created_at = new Date(item.created_at) > new Date(order.created_at) ? item.created_at : order.created_at;
    order.order_total += number(item.line_total);
    order.quantity += number(item.quantity);
    order.item_count += 1;
    order.fulfil_statuses.push(item.fulfil_status);
    order.items.push({ id: item.id, product_name: item.product_name, quantity: item.quantity, line_total: item.line_total, fulfil_status: item.fulfil_status, outlet_name: itemWithNames.outlet_name });
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
  const activeProducts = products.filter((product) => product.status === 'active').length;
  const activeOutlets = outletRows.filter((outlet) => outlet.status === 'active').length;
  const bookingItems = currentItems.filter((item) => item.slot_id || item.slot_starts_at).length;
  const totalOutletSales = salesByOutlet.reduce((total, outlet) => total + outlet.revenue, 0);

  return {
    vendor,
    filter,
    range: { start: start.toISOString(), end: now.toISOString() },
    stats: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: currentOrderIds.size,
      activeProducts,
      activeOutlets,
      bookingItems,
      revenueGrowth: percentChange(totalRevenue, previousRevenue),
      ordersGrowth: percentChange(currentOrderIds.size, previousOrderIds.size),
    },
    chart,
    salesByOutlet,
    totalOutletSales: Math.round(totalOutletSales * 100) / 100,
    topSelling,
    topRated,
    recentTransactions,
  };
}

export function formatGrowth(value: number) {
  return `${value >= 0 ? '+' : ''}${value}% vs previous period`;
}

export function formatRM(value: number) {
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
