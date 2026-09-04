import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isRatingEligibleProduct, isVisibleActiveProduct, resolveProductOutlet } from '@/lib/vendor/product-scope';

export type AnalyticsFilter = '7d' | '30d' | '12m';

export type AnalyticsItem = {
  order_id: string;
  outlet_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  line_total: number;
  created_at: string;
  slot_starts_at: string | null;
  order_status: string;
};

export type AnalyticsProduct = {
  id: string;
  name: string;
  base_price: number;
  status: string | null;
  outlet_id: string | null;
  outlet_offers?: Array<{ outlet_id: string; status?: string | null }> | null;
};

export type AnalyticsReview = { product_id: string; rating: number; created_at: string };
export type AnalyticsOutlet = { id: string; name: string; city: string | null; state: string | null };

export type AnalyticsInput = {
  range: { start: string; end: string };
  items: AnalyticsItem[];
  products: AnalyticsProduct[];
  reviews: AnalyticsReview[];
  outlets: AnalyticsOutlet[];
};

export type AnalyticsTrendPoint = {
  label: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
};

export type AnalyticsDemandCell = { weekday: number; hour: number; orders: number };

export type AnalyticsProductPerformance = {
  id: string;
  name: string;
  units: number;
  orders: number;
  revenue: number;
  averageOrderValue: number;
  rating: number | null;
  reviews: number;
  price: number;
  outletName: string;
};

export type AnalyticsOutletPerformance = {
  id: string;
  name: string;
  location: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  revenueShare: number;
  products: number;
};

export type AnalyticsInsight = {
  kind: 'top_product' | 'peak_window' | 'outlet_concentration';
  titleKey: string;
  descriptionKey: string;
  value: string;
};

export type VendorAnalyticsSnapshot = {
  range: AnalyticsInput['range'];
  filter: AnalyticsFilter;
  outletsAvailable: AnalyticsOutlet[];
  selectedOutletId: string | null;
  metrics: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    revenuePerOutlet: number;
    topProductShare: number;
    productsWithSales: number;
    peakWindowOrders: number;
    activeProducts: number;
    activeOutlets: number;
    averageRating: number | null;
    reviewCount: number;
  };
  bookingMix: { bookedOrders: number; nonBookedOrders: number; bookingShare: number };
  trend: AnalyticsTrendPoint[];
  demand: AnalyticsDemandCell[];
  products: AnalyticsProductPerformance[];
  outlets: AnalyticsOutletPerformance[];
  ratingDistribution: Array<{ rating: number; count: number }>;
  insights: AnalyticsInsight[];
};

type LocalParts = { year: number; month: number; day: number; hour: number; weekday: number };

const TIME_ZONE = 'Asia/Kuala_Lumpur';
const REVENUE_STATUSES = new Set(['paid', 'completed']);

function number(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function localParts(value: string | Date): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(values.weekday);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

function isRevenueItem(item: AnalyticsItem) {
  return REVENUE_STATUSES.has(item.order_status);
}

function money(value: number) {
  return round(value, 2);
}

function rangeDuration(start: string, end: string) {
  return new Date(end).getTime() - new Date(start).getTime();
}

function trendBucket(item: AnalyticsItem, input: AnalyticsInput) {
  const local = localParts(item.created_at);
  const duration = rangeDuration(input.range.start, input.range.end);
  if (duration > 45 * 86400000) return `${local.year}-${String(local.month).padStart(2, '0')}`;
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function trendLabel(key: string, input: AnalyticsInput) {
  const duration = rangeDuration(input.range.start, input.range.end);
  const date = duration > 45 * 86400000
    ? new Date(`${key}-01T00:00:00+08:00`)
    : new Date(`${key}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en-MY', duration > 45 * 86400000
    ? { timeZone: TIME_ZONE, month: 'short', year: '2-digit' }
    : { timeZone: TIME_ZONE, day: '2-digit', month: 'short' }).format(date);
}

function average(total: number, count: number) {
  return count ? money(total / count) : 0;
}

export function buildAnalyticsSnapshot(input: AnalyticsInput, filter: AnalyticsFilter = '30d', selectedOutletId: string | null = null): VendorAnalyticsSnapshot {
  const viewOutlets = selectedOutletId ? input.outlets.filter((outlet) => outlet.id === selectedOutletId) : input.outlets;
  const viewOutletIds = viewOutlets.map((outlet) => outlet.id);
  const scopedItems = input.items.filter((item) => isRevenueItem(item));
  const orderMap = new Map<string, AnalyticsItem[]>();
  for (const item of scopedItems) orderMap.set(item.order_id, [...(orderMap.get(item.order_id) || []), item]);

  const revenue = scopedItems.reduce((sum, item) => sum + number(item.line_total), 0);
  const orders = orderMap.size;
  const reviewRows = input.reviews.filter((review) => review.rating > 0);
  const reviewTotal = reviewRows.reduce((sum, review) => sum + number(review.rating), 0);
  const productById = new Map(input.products.map((product) => [product.id, product]));
  const outletById = new Map(input.outlets.map((outlet) => [outlet.id, outlet]));
  const outletNames = new Map(input.outlets.map((outlet) => [outlet.id, outlet.name]));
  const reviewMap = new Map<string, { total: number; count: number }>();
  for (const review of reviewRows) {
    const current = reviewMap.get(review.product_id) || { total: 0, count: 0 };
    current.total += number(review.rating);
    current.count += 1;
    reviewMap.set(review.product_id, current);
  }

  const trendMap = new Map<string, { revenue: number; orders: Set<string> }>();
  for (const item of scopedItems) {
    const key = trendBucket(item, input);
    const bucket = trendMap.get(key) || { revenue: 0, orders: new Set<string>() };
    bucket.revenue += number(item.line_total);
    bucket.orders.add(item.order_id);
    trendMap.set(key, bucket);
  }
  const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({
    label: trendLabel(key, input),
    revenue: money(bucket.revenue),
    orders: bucket.orders.size,
    averageOrderValue: average(bucket.revenue, bucket.orders.size),
  }));

  const demandMap = new Map<string, { weekday: number; hour: number; orders: Set<string> }>();
  for (const item of scopedItems) {
    const local = localParts(item.created_at);
    const key = `${local.weekday}-${local.hour}`;
    const cell = demandMap.get(key) || { weekday: local.weekday, hour: local.hour, orders: new Set<string>() };
    cell.orders.add(item.order_id);
    demandMap.set(key, cell);
  }
  const demand = [...demandMap.values()].map((cell) => ({ weekday: cell.weekday, hour: cell.hour, orders: cell.orders.size }));

  const productMap = new Map<string, { units: number; orders: Set<string>; revenue: number }>();
  for (const item of scopedItems) {
    const key = item.product_id || item.product_name;
    const current = productMap.get(key) || { units: 0, orders: new Set<string>(), revenue: 0 };
    current.units += number(item.quantity);
    current.orders.add(item.order_id);
    current.revenue += number(item.line_total);
    productMap.set(key, current);
  }
  const products = [...productMap.entries()].map(([id, stats]) => {
    const product = productById.get(id);
    const rating = product ? reviewMap.get(product.id) : undefined;
    const outletId = product ? resolveProductOutlet(product, viewOutletIds)?.id : undefined;
    const fallbackOutletId = scopedItems.find((item) => (item.product_id || item.product_name) === id)?.outlet_id;
    return {
      id,
      name: product?.name || scopedItems.find((item) => (item.product_id || item.product_name) === id)?.product_name || 'Unnamed experience',
      units: stats.units,
      orders: stats.orders.size,
      revenue: money(stats.revenue),
      averageOrderValue: average(stats.revenue, stats.orders.size),
      rating: rating ? round(rating.total / rating.count) : null,
      reviews: rating?.count || 0,
      price: number(product?.base_price),
      outletName: outletNames.get(outletId || fallbackOutletId || '') || 'Unassigned outlet',
    } satisfies AnalyticsProductPerformance;
  }).sort((a, b) => b.revenue - a.revenue || b.units - a.units);

  const outletMap = new Map<string, { orders: Set<string>; revenue: number; products: Set<string> }>();
  for (const item of scopedItems) {
    const current = outletMap.get(item.outlet_id) || { orders: new Set<string>(), revenue: 0, products: new Set<string>() };
    current.orders.add(item.order_id);
    current.revenue += number(item.line_total);
    current.products.add(item.product_id || item.product_name);
    outletMap.set(item.outlet_id, current);
  }
  const outlets = [...outletMap.entries()].map(([id, stats]) => {
    const outlet = outletById.get(id);
    return {
      id,
      name: outlet?.name || 'Unknown outlet',
      location: [outlet?.city, outlet?.state].filter(Boolean).join(', ') || 'Malaysia',
      revenue: money(stats.revenue),
      orders: stats.orders.size,
      averageOrderValue: average(stats.revenue, stats.orders.size),
      revenueShare: revenue ? round((stats.revenue / revenue) * 100) : 0,
      products: stats.products.size,
    } satisfies AnalyticsOutletPerformance;
  }).sort((a, b) => b.revenue - a.revenue);

  const bookedOrders = new Set(scopedItems.filter((item) => item.slot_starts_at).map((item) => item.order_id)).size;
  const nonBookedOrders = Math.max(0, orders - bookedOrders);
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviewRows.filter((review) => Math.round(review.rating) === rating).length }));
  const peakCell = [...demand].sort((a, b) => b.orders - a.orders || a.weekday - b.weekday || a.hour - b.hour)[0];
  const peakProduct = products[0];
  const peakOutlet = outlets[0];
  const insights: AnalyticsInsight[] = [];
  if (peakProduct) insights.push({ kind: 'top_product', titleKey: 'analytics.insights.topProductTitle', descriptionKey: 'analytics.insights.topProductDescription', value: peakProduct.name });
  if (peakCell) insights.push({ kind: 'peak_window', titleKey: 'analytics.insights.peakWindowTitle', descriptionKey: 'analytics.insights.peakWindowDescription', value: `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][peakCell.weekday]} ${peakCell.hour}:00` });
  if (peakOutlet) insights.push({ kind: 'outlet_concentration', titleKey: 'analytics.insights.outletConcentrationTitle', descriptionKey: 'analytics.insights.outletConcentrationDescription', value: `${peakOutlet.revenueShare}%` });

  return {
    range: input.range,
    filter,
    outletsAvailable: input.outlets,
    selectedOutletId,
    metrics: {
      revenue: money(revenue),
      orders,
      averageOrderValue: average(revenue, orders),
      revenuePerOutlet: average(revenue, Math.max(1, viewOutlets.length)),
      topProductShare: revenue && products[0] ? round((products[0].revenue / revenue) * 100) : 0,
      productsWithSales: products.length,
      peakWindowOrders: peakCell?.orders || 0,
      activeProducts: input.products.filter((product) => isVisibleActiveProduct(product, viewOutletIds)).length,
      activeOutlets: viewOutlets.length,
      averageRating: reviewRows.length ? round(reviewTotal / reviewRows.length) : null,
      reviewCount: reviewRows.length,
    },
    bookingMix: { bookedOrders, nonBookedOrders, bookingShare: orders ? round((bookedOrders / orders) * 100) : 0 },
    trend,
    demand,
    products,
    outlets,
    ratingDistribution,
    insights,
  };
}

function analyticsRange(filter: AnalyticsFilter) {
  const end = new Date();
  const start = new Date(end);
  if (filter === '7d') start.setDate(start.getDate() - 6);
  if (filter === '30d') start.setDate(start.getDate() - 29);
  if (filter === '12m') {
    start.setMonth(start.getMonth() - 11, 1);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeFilter(value: string | undefined): AnalyticsFilter {
  return value === '7d' || value === '12m' ? value : '30d';
}

export async function getVendorAnalyticsData(filterValue: AnalyticsFilter = '30d', outletId?: string) {
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return null;

  const { data: ownedVendors, error: vendorError } = await authDb.from('vendors').select('id,name,status').eq('owner_id', user.id).eq('status', 'approved').limit(1);
  if (vendorError) throw vendorError;
  let vendor = ownedVendors?.[0];
  let scopedOutletIds: string[] | null = null;
  if (!vendor) {
    const { data: assignments, error: assignmentError } = await authDb.from('outlet_managers').select('outlet_id,outlets(vendor_id)').eq('user_id', user.id);
    if (assignmentError) throw assignmentError;
    const rows = assignments || [];
    const vendorIds = [...new Set(rows.map((row: { outlets: { vendor_id: string } | { vendor_id: string }[] }) => Array.isArray(row.outlets) ? row.outlets[0]?.vendor_id : row.outlets?.vendor_id).filter(Boolean))];
    const managerVendorId = vendorIds[0];
    if (managerVendorId) {
      const { data: managerVendors, error: managerVendorError } = await authDb.from('vendors').select('id,name,status').eq('id', managerVendorId).eq('status', 'approved').limit(1);
      if (managerVendorError) throw managerVendorError;
      vendor = managerVendors?.[0];
      scopedOutletIds = rows.filter((row: { outlet_id?: string; outlets: { vendor_id: string } | { vendor_id: string }[] }) => {
        const related = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
        return related?.vendor_id === managerVendorId && row.outlet_id;
      }).map((row: { outlet_id: string }) => row.outlet_id);
    }
  }
  if (!vendor) return null;

  const db = createServiceClient();
  const { data: allOutlets, error: outletError } = await db.from('outlets').select('id,name,city,state,status').eq('vendor_id', vendor.id).order('name');
  if (outletError) throw outletError;
  const outlets = (scopedOutletIds ? (allOutlets || []).filter((outlet: { id: string }) => scopedOutletIds?.includes(outlet.id)) : allOutlets || []) as AnalyticsOutlet[];
  const outletIds = outlets.map((outlet) => outlet.id);
  const filter = normalizeFilter(filterValue);
  const range = analyticsRange(filter);
  const selectedOutletId = outletId && outletIds.includes(outletId) ? outletId : null;
  const queryOutletIds = selectedOutletId ? [selectedOutletId] : outletIds;

  const [itemsResult, productsResult, reviewsResult] = await Promise.all([
    queryOutletIds.length
      ? db.from('order_items').select('order_id,outlet_id,product_id,product_name,quantity,line_total,created_at,slot_starts_at,orders!inner(status)').in('outlet_id', queryOutletIds).gte('created_at', range.start).lte('created_at', range.end).order('created_at', { ascending: false }).limit(10000)
      : Promise.resolve({ data: [], error: null }),
    db.from('products').select('id,name,base_price,status,outlet_id,outlet_offers(outlet_id,status)').eq('vendor_id', vendor.id),
    db.from('reviews').select('product_id,rating,created_at').eq('vendor_id', vendor.id).eq('is_visible', true).gte('created_at', range.start).lte('created_at', range.end),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;

  const products = ((productsResult.data || []) as Array<AnalyticsProduct & { base_price: number | string | null }>).map((product) => ({ ...product, base_price: number(product.base_price) }));
  const productIds = new Set(products.map((product) => product.id));
  const items = ((itemsResult.data || []) as Array<AnalyticsItem & { orders?: { status?: string | null } | { status?: string | null }[] }>).map((item) => ({
    ...item,
    quantity: number(item.quantity),
    line_total: number(item.line_total),
    order_status: Array.isArray(item.orders) ? item.orders[0]?.status || 'unknown' : item.orders?.status || 'unknown',
  })).filter((item) => !item.product_id || productIds.has(item.product_id));
  const reviews = ((reviewsResult.data || []) as AnalyticsReview[]).filter((review) => {
    const product = products.find((candidate) => candidate.id === review.product_id);
    return product ? isRatingEligibleProduct(product, outletIds) : false;
  });

  return buildAnalyticsSnapshot({ range, items, products, reviews, outlets }, filter, selectedOutletId);
}
