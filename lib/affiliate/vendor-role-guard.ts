// P4 — Member 4: vendor/outlet-manager affiliate ineligibility.
//
// Team decision (2026-08-01): vendor_owner and outlet_manager accounts must
// not earn affiliate commission at all. Neither role is a scalar column —
// confirmed against 001_initial_schema.sql before writing this:
//   - There is NO `users.role` column anywhere in the schema.
//   - vendor_owner = a row in `vendors` where owner_id = the user.
//   - outlet_manager = a row in `outlet_managers` where user_id = the user
//     (enforced 1:1 per 009_outlet_manager_one_to_one.sql).
// This mirrors lib/vendor-authorization.ts::authorizeVendor()'s own pattern
// exactly (it checks vendors.owner_id / outlet_managers directly) rather
// than the separate, best-effort user_roles/roles join table — that table
// is what populates the CLIENT-SIDE currentUser.role (see
// components/providers/auth.tsx::loadSupabaseUser()), kept loosely in sync,
// not the authoritative source for vendor_owner. Every server-side
// enforcement point in this module (the commission guard, the link route,
// the fraud sweep) must use THIS function, not currentUser.role.
//
// vendors.status has exactly 4 real values (the live CHECK constraint,
// 001_initial_schema.sql — NOT the wider draft/pending_review union some
// vendor-onboarding-status UI code uses defensively): pending, approved,
// rejected, suspended. A REJECTED application is explicitly excluded from
// blocking — team's own call: "A rejected vendor applicant is just a
// regular customer... permanently barring them over a failed application
// is wrong." pending/approved/suspended all still block; an outlet_managers
// row always blocks unconditionally (no "rejected" state exists there).

import type { SupabaseClient } from '@supabase/supabase-js';

const BLOCKING_VENDOR_STATUSES = ['pending', 'approved', 'suspended'] as const;

export type VendorIneligibleRole = 'vendor_owner' | 'outlet_manager';

/**
 * Fresh, authoritative check — always queries live, never relies on a
 * cached/stale value (affiliate_links.is_active in particular must never be
 * used as a proxy for this). Returns the specific role reason so callers
 * can log it, or null if the user is not currently vendor-ineligible.
 */
export async function getVendorIneligibleRole(service: SupabaseClient, userId: string): Promise<VendorIneligibleRole | null> {
  const [{ data: vendorRow }, { data: outletManagerRow }] = await Promise.all([
    service.from('vendors').select('id').eq('owner_id', userId).in('status', BLOCKING_VENDOR_STATUSES).limit(1).maybeSingle(),
    service.from('outlet_managers').select('id').eq('user_id', userId).limit(1).maybeSingle(),
  ]);

  if (vendorRow) return 'vendor_owner';
  if (outletManagerRow) return 'outlet_manager';
  return null;
}

export async function isVendorOrOutletManager(service: SupabaseClient, userId: string): Promise<boolean> {
  return (await getVendorIneligibleRole(service, userId)) !== null;
}
