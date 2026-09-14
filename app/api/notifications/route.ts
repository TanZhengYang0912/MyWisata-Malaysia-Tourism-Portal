import { createClient } from '@/lib/supabase/server';
import { authorizeVendor, type VendorAccess } from '@/lib/vendor-authorization';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const PAGE_SIZE_MAX = 50;
const CATEGORIES = new Set(['wallet', 'bookings_purchases', 'recommendations_affiliate', 'support', 'account_security', 'messages']);
const VENDOR_CATEGORIES = new Set(['vendor_orders', 'vendor_bookings', 'vendor_products', 'vendor_wallet', 'vendor_account']);
const VENDOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? 'customer';
  if (scope !== 'customer' && scope !== 'vendor') return apiFail('INVALID_SCOPE', 'Unknown notification scope', 400);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(url.searchParams.get('pageSize') ?? 15) || 15));
  const read = url.searchParams.get('read') ?? 'all';
  const category = url.searchParams.get('category') ?? 'all';
  if (!['all', 'unread', 'read'].includes(read)) return apiFail('INVALID_READ_FILTER', 'Unknown read filter', 400);
  if (scope === 'vendor' && category !== 'all' && !VENDOR_CATEGORIES.has(category)) return apiFail('INVALID_CATEGORY', 'Unknown notification category', 400);

  let queryDb = db;
  let scopedVendor: VendorAccess | null = null;
  if (scope === 'vendor') {
    const vendorId = url.searchParams.get('vendorId');
    if (!vendorId || !VENDOR_ID.test(vendorId)) return apiFail('INVALID_VENDOR', 'A valid vendorId is required for vendor notifications', 400);
    const authorization = await authorizeVendor(vendorId);
    if (!authorization.ok) return authorization.response;
    scopedVendor = authorization.access;
    queryDb = authorization.access.serviceDb as typeof db;
  }

  let query = queryDb.from('notifications').select('id,type,title,body,link,category,metadata,read_at,created_at', { count: 'exact' }).eq('user_id', user.id).order('created_at', { ascending: false });
  if (scope === 'vendor' && scopedVendor) {
    query = query.eq('vendor_id', scopedVendor.vendorId);
    if (scopedVendor.isOutletManager) {
      query = query.in('outlet_id', scopedVendor.outletIds);
      query = query.eq('audience_role', 'outlet_manager');
      query = query.not('category', 'in', '(vendor_wallet,vendor_account)');
    }
  }
  if (read === 'unread') query = query.is('read_at', null);
  if (read === 'read') query = query.not('read_at', 'is', null);
  if (scope === 'vendor' ? category !== 'all' : CATEGORIES.has(category)) query = query.eq('category', category);
  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ items: (data ?? []).map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, link: row.link, category: row.category ?? 'account_security', metadata: row.metadata ?? {}, readAt: row.read_at, createdAt: row.created_at })), page, pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) });
}
