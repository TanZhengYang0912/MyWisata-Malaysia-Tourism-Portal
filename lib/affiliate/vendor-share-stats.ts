// P4 — Member 4: vendor share analytics. CLAUDE-VENDOR-SHARE-ANALYTICS.md §12.3.3.
//
// Read-only against Member 2's tables (vendors, outlets, products) — never
// writes. Vendor identity resolution mirrors lib/vendor-dashboard.ts's own
// algorithm exactly (owner_id first, outlet_managers fallback) so "which
// vendor does this user act for" never disagrees with the real dashboard —
// but this is its own standalone function, not an import of their file,
// since that one returns dashboard-shaped data (revenue/orders/inventory)
// this has no reason to compute.
//
// Same honest-degradation rule as lib/affiliate/funnel.ts: share counts and
// their per-platform breakdown are always exact (share_events.platform is
// always populated). Clicks/orders per listing are real totals. What is NOT
// done: splitting clicks/orders BY platform — that would require
// affiliate_clicks.source (only populated going forward, migration 035) and
// this feature doesn't attempt it, so there's nothing to fabricate.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { resolveProductNames } from './product-names';

export interface VendorContext {
  vendorId: string;
  role: 'vendor_owner' | 'outlet_manager';
}

/**
 * Resolves the logged-in user's vendor, the same two-step lookup
 * lib/vendor-dashboard.ts uses (owner_id, then outlet_managers). Cookie-aware
 * client only — this is an ownership check, must run as the caller's own
 * session so RLS actually proves they own what they claim.
 */
export async function resolveVendorForUser(userId: string): Promise<VendorContext | null> {
  const authClient = await createClient();

  const { data: ownedVendors } = await authClient
    .from('vendors')
    .select('id')
    .eq('owner_id', userId)
    .eq('status', 'approved')
    .limit(1);
  if (ownedVendors?.[0]) return { vendorId: ownedVendors[0].id, role: 'vendor_owner' };

  const { data: assignments } = await authClient
    .from('outlet_managers')
    .select('outlets(vendor_id)')
    .eq('user_id', userId);
  const managerVendorIds = [
    ...new Set(
      (assignments ?? [])
        .map((a) => {
          const outlet = Array.isArray(a.outlets) ? a.outlets[0] : a.outlets;
          return (outlet as { vendor_id?: string } | null)?.vendor_id;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const managerVendorId = managerVendorIds[0];
  if (!managerVendorId) return null;

  const { data: managerVendors } = await authClient
    .from('vendors')
    .select('id')
    .eq('id', managerVendorId)
    .eq('status', 'approved')
    .limit(1);
  if (!managerVendors?.[0]) return null;

  return { vendorId: managerVendors[0].id, role: 'outlet_manager' };
}

export type ListingType = 'product' | 'outlet';

export interface PlatformCount {
  platform: string;
  count: number;
}

export interface ListingShareStat {
  listingType: ListingType;
  listingId: string;
  listingName: string;
  shares: number;
  platformBreakdown: PlatformCount[];
  topPlatform: string | null;
  clicks: number;
  orders: number;
}

export interface VendorShareStats {
  vendorId: string;
  totals: { shares: number; clicks: number; orders: number };
  listings: ListingShareStat[];
  /** True once >=1 relevant click has a non-null source — mirrors funnel.ts's
   *  honesty flag. Not used to split clicks/orders by platform here (this
   *  feature never attempts that); only shown as a one-line UI caveat. */
  sourceTrackingActive: boolean;
}

function topPlatformOf(breakdown: PlatformCount[]): string | null {
  if (!breakdown.length) return null;
  return breakdown.reduce((top, p) => (p.count > top.count ? p : top), breakdown[0]).platform;
}

/**
 * `service` must already be scoped by a verified vendorId (the caller proved
 * ownership via resolveVendorForUser or an admin check) — this function
 * itself does no permission check, it only reads.
 */
export async function getVendorShareStats(service: SupabaseClient, vendorId: string): Promise<VendorShareStats> {
  const [{ data: outlets }, { data: products }] = await Promise.all([
    service.from('outlets').select('id, name').eq('vendor_id', vendorId),
    service.from('products').select('id').eq('vendor_id', vendorId),
  ]);
  const outletRows = outlets ?? [];
  const outletIds = outletRows.map((o) => o.id);
  const productIds = (products ?? []).map((p) => p.id);
  const outletNames = new Map(outletRows.map((o) => [o.id, o.name as string]));

  if (!outletIds.length && !productIds.length) {
    return { vendorId, totals: { shares: 0, clicks: 0, orders: 0 }, listings: [], sourceTrackingActive: false };
  }

  const [{ data: productShares }, { data: outletShares }, { data: productClicks }, { data: outletClicks }] = await Promise.all([
    productIds.length
      ? service.from('share_events').select('content_id, platform').eq('content_type', 'product').in('content_id', productIds)
      : Promise.resolve({ data: [] as { content_id: string; platform: string | null }[] }),
    outletIds.length
      ? service.from('share_events').select('content_id, platform').in('content_type', ['outlet', 'vendor']).in('content_id', outletIds)
      : Promise.resolve({ data: [] as { content_id: string; platform: string | null }[] }),
    productIds.length
      ? service.from('affiliate_clicks').select('id, target_id, source').eq('target_type', 'product').in('target_id', productIds)
      : Promise.resolve({ data: [] as { id: string; target_id: string; source: string | null }[] }),
    outletIds.length
      ? service.from('affiliate_clicks').select('id, target_id, source').eq('target_type', 'outlet').in('target_id', outletIds)
      : Promise.resolve({ data: [] as { id: string; target_id: string; source: string | null }[] }),
  ]);

  const allClicks = [...(productClicks ?? []), ...(outletClicks ?? [])];
  const clickIds = allClicks.map((c) => c.id);
  const { data: attributions } = clickIds.length
    ? await service.from('affiliate_attributions').select('click_id, status').in('click_id', clickIds).neq('status', 'reversed')
    : { data: [] as { click_id: string; status: string }[] };

  const clickTarget = new Map(allClicks.map((c) => [c.id, c.target_id]));

  function buildStat(listingType: ListingType, id: string, name: string): ListingShareStat {
    const shareRows = (listingType === 'product' ? productShares : outletShares) ?? [];
    const listingShares = shareRows.filter((s) => s.content_id === id);
    const platformCounts = new Map<string, number>();
    for (const s of listingShares) {
      const platform = s.platform ?? 'unknown';
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    }
    const platformBreakdown = [...platformCounts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    const clickRows = (listingType === 'product' ? productClicks : outletClicks) ?? [];
    const listingClickIds = clickRows.filter((c) => c.target_id === id).map((c) => c.id);
    const orders = (attributions ?? []).filter((a) => listingClickIds.includes(a.click_id)).length;

    return {
      listingType,
      listingId: id,
      listingName: name,
      shares: listingShares.length,
      platformBreakdown,
      topPlatform: topPlatformOf(platformBreakdown),
      clicks: listingClickIds.length,
      orders,
    };
  }

  const productNames = await resolveProductNames(productIds);

  const listings: ListingShareStat[] = [
    ...productIds.map((id) => buildStat('product', id, productNames.get(id) ?? 'Deleted listing')),
    ...outletIds.map((id) => buildStat('outlet', id, outletNames.get(id) ?? 'Deleted outlet')),
  ]
    // Only surface listings with at least one share/click — an untouched
    // catalogue of 40 products shouldn't render 40 all-zero rows.
    .filter((l) => l.shares > 0 || l.clicks > 0)
    .sort((a, b) => b.shares - a.shares);

  const totals = listings.reduce(
    (acc, l) => ({ shares: acc.shares + l.shares, clicks: acc.clicks + l.clicks, orders: acc.orders + l.orders }),
    { shares: 0, clicks: 0, orders: 0 },
  );

  const sourceTrackingActive = allClicks.some((c) => c.source !== null);

  return { vendorId, totals, listings, sourceTrackingActive };
}
