import { createClient } from '@/lib/supabase/server';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const VENDOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') ?? 'customer';
  if (scope !== 'customer' && scope !== 'vendor') return apiFail('INVALID_SCOPE', 'Unknown notification scope', 400);
  let queryDb = db;
  const vendorId = url.searchParams.get('vendorId');
  const access = scope === 'vendor'
    ? (vendorId && VENDOR_ID.test(vendorId) ? await authorizeVendor(vendorId) : null)
    : null;
  if (scope === 'vendor') {
    if (!access) return apiFail('INVALID_VENDOR', 'A valid vendorId is required for vendor notifications', 400);
    if (!access.ok) return access.response;
    queryDb = access.access.serviceDb as typeof db;
  }
  let query = queryDb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null);
  if (scope === 'vendor' && access?.ok) {
    query = query.eq('vendor_id', access.access.vendorId);
    if (access.access.isOutletManager) {
      query = query.in('outlet_id', access.access.outletIds).eq('audience_role', 'outlet_manager').not('category', 'in', '(vendor_wallet,vendor_account)');
    }
  }
  const { error } = await query;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ readAll: true });
}
