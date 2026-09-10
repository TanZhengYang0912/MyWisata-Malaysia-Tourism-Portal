// P4 — vendor order settlement breakdown for the caller's own vendor.
// GET /api/vendor/settlements[?vendorId=...] — per-order gross / platform fee /
// net, pending vs cleared totals. vendorId param honoured only for super_admin;
// anyone else's is derived from their session (same guard as
// /api/vendor/share-analytics).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { resolveVendorForUser } from '@/lib/affiliate/vendor-share-stats';
import { getVendorSettlements } from '@/lib/vendor/settlement';

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
    if (context.role !== 'vendor_owner') return apiFail('FORBIDDEN', 'Vendor owner permission required', 403);
    if (requestedVendorId && requestedVendorId !== context.vendorId) {
      return apiFail('FORBIDDEN', "Cannot view another vendor's settlements", 403);
    }
    vendorId = context.vendorId;
  }

  return apiOk(await getVendorSettlements(createServiceClient(), vendorId));
}
