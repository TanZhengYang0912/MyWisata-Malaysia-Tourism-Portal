// P4 — Member 4: vendor share analytics. CLAUDE-VENDOR-SHARE-ANALYTICS.md §12.3.3.
// GET /api/vendor/share-analytics[?vendorId=...] — per-listing share/click/order
// counts for the caller's own vendor. vendorId query param is only honoured
// for super_admin (viewing any vendor); anyone else's vendorId is
// derived from their own session and a mismatched param is rejected, never
// silently ignored — a vendor must not be able to probe another vendor's id.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { resolveVendorForUser, getVendorShareStats } from '@/lib/affiliate/vendor-share-stats';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const requestedVendorId = new URL(request.url).searchParams.get('vendorId');

  let vendorId: string;
  if (requestedVendorId && (await isSuperAdmin(supabase, user.id))) {
    vendorId = requestedVendorId;
  } else {
    const context = await resolveVendorForUser(user.id);
    if (!context) return apiFail('FORBIDDEN', 'No approved vendor is linked to this account', 403);
    if (context.role !== 'vendor_owner') {
      return apiFail('FORBIDDEN', 'Vendor owner permission required', 403);
    }
    if (requestedVendorId && requestedVendorId !== context.vendorId) {
      return apiFail('FORBIDDEN', "Cannot view another vendor's share analytics", 403);
    }
    vendorId = context.vendorId;
  }

  const service = createServiceClient();
  const stats = await getVendorShareStats(service, vendorId);
  return apiOk(stats);
}
