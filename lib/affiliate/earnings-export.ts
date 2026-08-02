// P4 — Member 4: affiliate earnings export. CLAUDE-P4-EXTRAS-2.md Extra 6.
//
// Deliberately NOT a reuse of getAffiliateStats() (lib/affiliate/stats.ts)
// even though the two overlap heavily — that function has no date-range
// filtering (the export needs "this month / this year / all", applied at
// the query level, not client-side after fetching everything) and returns
// a lot of aggregate data (byProduct, clicksByDay, funnel, tier) this export
// has no use for. Same building blocks are reused instead: resolveProductNames()
// and the same service-role orders lookup, for the same RLS-gap reason
// documented in stats.ts's file header (orders_own_or_admin has no
// affiliate-entitlement clause).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveProductNames } from './product-names';

export type EarningsExportRange = 'month' | 'year' | 'all';

export interface EarningsExportRow {
  date: string; // affiliate_attributions.created_at (ISO)
  productName: string;
  orderReference: string; // orders.display_id ("ORD-1234"), falls back to the raw order id
  orderAmount: number | null;
  /** The rate STAMPED on this attribution row at the time it was created —
   *  never recomputed from the affiliate's current tier. A past commission
   *  must show the rate it was actually paid at, even if the affiliate's
   *  tier (and therefore rate) has since changed. Fraction, e.g. 0.04. */
  commissionRate: number;
  commissionAmount: number;
  status: 'pending' | 'confirmed' | 'reversed';
  clearedAt: string | null; // ISO, null while still pending/reversed
}

function rangeCutoffIso(range: EarningsExportRange): string | null {
  const now = new Date();
  if (range === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }
  if (range === 'year') {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  }
  return null;
}

/**
 * `service` should be the caller's cookie-aware client — affiliate_links /
 * affiliate_clicks / affiliate_attributions all carry real own-row RLS
 * (migration 011), so scoping to `userId`'s own data is enforced by
 * Postgres itself, not just by this function filtering correctly. The
 * `userId` passed in must come from the authenticated session (the route
 * below does this), never from a request parameter — there is no "export
 * a different user's earnings" code path here at all, by construction.
 */
export async function getAffiliateEarningsExport(
  service: SupabaseClient,
  userId: string,
  range: EarningsExportRange,
): Promise<EarningsExportRow[]> {
  const { data: link } = await service.from('affiliate_links').select('id').eq('user_id', userId).maybeSingle();
  if (!link) return [];

  const { data: clicksData } = await service
    .from('affiliate_clicks')
    .select('id, target_type, target_id')
    .eq('link_id', link.id);
  const clickRows = clicksData ?? [];
  const clickIds = clickRows.map((c) => c.id);
  if (!clickIds.length) return [];

  // ⚠️ confirmed_at, not just cleared_at: live-found while building this
  // export — affiliate_attributions carries TWO independent "when did this
  // clear" timestamps from two different clearing mechanisms that both
  // still exist. lib/affiliate/clearing.ts::clearMaturedCommissions() (the
  // one this whole module's docs describe as authoritative) sets cleared_at.
  // But migrations 014–016 also added an EARLIER, separate DB-level
  // confirm_pending_earnings() RPC — still live, still wired to a daily
  // Vercel Cron (app/api/cron/clear-earnings) and an admin route
  // (app/api/admin/clear-earnings) — which sets confirmed_at instead, gated
  // on a hold_until column the current onOrderPaid() never populates for
  // new rows. Net effect, confirmed live against real data: it's
  // structurally a no-op for anything created after Phase 2, but at least
  // one pre-Phase-2 row (status='confirmed', confirmed_at set, cleared_at
  // NULL) still exists from before the switch. Reading cleared_at alone
  // would show a blank "Cleared Date" for a row that IS genuinely
  // confirmed — wrong for a document whose whole purpose is financial
  // accuracy. Falls back to confirmed_at below. NOT attempting to reconcile
  // or retire either clearing mechanism here — well outside this extra's
  // scope — but this is worth someone owning deliberately, not by accident.
  const cutoff = rangeCutoffIso(range);
  let query = service
    .from('affiliate_attributions')
    .select('id, click_id, order_id, commission_rate, commission_amount, status, created_at, cleared_at, confirmed_at')
    .in('click_id', clickIds)
    .order('created_at', { ascending: false });
  if (cutoff) query = query.gte('created_at', cutoff);
  const { data: attributionsData } = await query;
  const attributionRows = attributionsData ?? [];
  if (!attributionRows.length) return [];

  const clickTarget = new Map(clickRows.map((c) => [c.id, c.target_type === 'product' ? c.target_id : null]));

  // Same RLS gap as lib/affiliate/stats.ts: orders_own_or_admin grants the
  // buyer/admin/vendor SELECT, not the affiliate who earned a commission
  // from it — service-role is required here regardless of which client the
  // caller passed in for everything else.
  const orderIds = [...new Set(attributionRows.map((a) => a.order_id))];
  const { data: ordersData } = orderIds.length
    ? await createServiceClient().from('orders').select('id, display_id, total_amount').in('id', orderIds)
    : { data: [] as { id: string; display_id: string | null; total_amount: number }[] };
  const ordersById = new Map((ordersData ?? []).map((o) => [o.id, o]));

  const productRefs = [
    ...new Set(attributionRows.map((a) => clickTarget.get(a.click_id)).filter((ref): ref is string => Boolean(ref))),
  ];
  const productNames = await resolveProductNames(productRefs);

  return attributionRows.map((a) => {
    const productId = clickTarget.get(a.click_id);
    const order = ordersById.get(a.order_id);
    return {
      date: a.created_at,
      productName: productId ? (productNames.get(productId) ?? 'Deleted listing') : 'Unknown',
      orderReference: order?.display_id ?? a.order_id,
      orderAmount: order ? Number(order.total_amount) : null,
      commissionRate: Number(a.commission_rate),
      commissionAmount: Number(a.commission_amount),
      status: a.status as EarningsExportRow['status'],
      clearedAt: a.cleared_at ?? a.confirmed_at,
    };
  });
}
