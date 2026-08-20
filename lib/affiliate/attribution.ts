// P4 — Member 4: conversion + commission. See CLAUDE.md Step 4.
//
// onOrderPaid() is the single integration point the checkout owner should
// eventually call from the end of commerce.ts::createOrder() — see CLAUDE.md
// Section 6. Do not call it from anywhere else in this module except the dev
// purchase simulator (Step 5), and do not refactor createOrder() to add the
// call yourself.
//
// ⚠️ Post-merge update: migration 019_pr_industrial_atomicity.sql (someone
// else's work, pulled in) added orders.affiliate_click_id specifically to
// solve this function's original constraint — its own comment says
// "Decouples onOrderPaid() from browser cookies... callable from any
// context." This function now reads THAT column first. The mw_ref cookie is
// only a fallback, used when the column is empty (e.g. the dev simulator,
// or any future caller that hasn't been updated to populate the column
// yet). Cookie access is now wrapped defensively (tryReadClickIdCookie /
// tryClearClickIdCookie below) — next/headers' cookies() throws outside a
// request-scoped context, and the whole point of the new column is that
// this function no longer requires one.
//
// ⚠️ Phase 2 change (Feature D, migration 014): this function used to credit
// the wallet immediately via creditAffiliateCommission(). It no longer does
// — it only inserts the 'pending' attribution row. The wallet credit now
// happens in lib/affiliate/clearing.ts, once the commission actually clears
// (platform_settings['wallet.clearance_days'], default 7). See migration
// 014's comment for why. Do not add a creditAffiliateCommission() call back
// here — that would credit the wallet twice (once here, once at clearing).
//
// ⚠️ Phase 2 (Feature B, migration 014): the flat-rate lookup
// (getAffiliateCommissionRate, lib/affiliate/commission.ts) is gone — rate
// resolution is now tiered, based on the link owner's lifetime CONFIRMED
// referral count. See lib/affiliate/tier.ts.
//
// ⚠️ Phase 2 (Feature C, migration 014): every guard trip below now writes
// an affiliate_fraud_flags row before returning — previously these guards
// were silent (a bare `return`), so a blocked self-referral or duplicate
// payout left no trace anywhere. See lib/affiliate/fraud.ts.

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPercent } from '@/lib/money';
import { getAttributionCookieDays } from './settings';
import { getTierForUser } from './tier';
import { logFraudFlag, autoDisableLink } from './fraud';
import { notifyCommissionEarned } from './notifications';
import { getVendorIneligibleRole } from './vendor-role-guard';

const MW_REF_COOKIE = 'mw_ref';
const LIMITED_MONTHLY_COMMISSION_CAP_RM = 100;

interface OrderPurchaseDetail {
  /** order_items.product_name is a name SNAPSHOT taken at purchase time — accurate even if the product's since been renamed/deleted. */
  productNames: string[];
  /** Resolved from order_items.vendor_id -> vendors.name — the seller(s), not the buyer. */
  vendorNames: string[];
  /** orders.paid_at, falling back to created_at for an order that never went through a "paid" transition (shouldn't normally happen by the time a guard runs, but never leave this blank if avoidable). */
  purchasedAt: string | null;
}

/**
 * "What item, from which seller, and when" for a fraud-flag's `detail`
 * column — every guard in onOrderPaid() already has orderId in scope, so
 * this is one extra pair of queries (order_items -> vendors) shared across
 * whichever guard actually trips, not duplicated per guard.
 */
async function resolveOrderPurchaseDetail(
  service: SupabaseClient,
  orderId: string,
  paidAt: string | null,
  createdAt: string | null,
): Promise<OrderPurchaseDetail> {
  const { data: itemsData } = await service.from('order_items').select('product_name, vendor_id').eq('order_id', orderId);
  const items = itemsData ?? [];
  const vendorIds = [...new Set(items.map((i) => i.vendor_id))];
  const { data: vendorsData } = vendorIds.length
    ? await service.from('vendors').select('id, name').in('id', vendorIds)
    : { data: [] as { id: string; name: string }[] };
  const vendorNameById = new Map((vendorsData ?? []).map((v) => [v.id, v.name]));
  return {
    productNames: items.map((i) => i.product_name),
    vendorNames: [...new Set(items.map((i) => vendorNameById.get(i.vendor_id) ?? 'Unknown vendor'))],
    purchasedAt: paidAt ?? createdAt ?? null,
  };
}

/** Best-effort cookie read — returns null (not throws) outside a request-scoped context. */
async function tryReadClickIdCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(MW_REF_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** Best-effort cookie clear — a no-op (not a throw) outside a request-scoped context. */
async function tryClearClickIdCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(MW_REF_COOKIE);
  } catch {
    // no-op — nothing to clear if this context has no cookie access
  }
}

/**
 * Safe to call twice for the same order (the UNIQUE(order_id) constraint on
 * affiliate_attributions — migration 011 — makes the second call a no-op).
 * Never throws into the caller's checkout flow.
 */
export async function onOrderPaid(orderId: string): Promise<void> {
  try {
    // Service-role throughout: affiliate_links only has an owner-only SELECT
    // policy, and this hook has no reason to run as any particular user's
    // session anyway (it credits a third party's wallet). See CLAUDE.md
    // Section 2 for the full per-table RLS/grants breakdown.
    const service = createServiceClient();

    // orders.affiliate_click_id first (works from any context — see file
    // header), the mw_ref cookie only as a fallback.
    const { data: order } = await service
      .from('orders')
      .select('id, user_id, status, total_amount, affiliate_click_id, paid_at, created_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return;

    // Lazy + memoized: only queried the first time a guard actually needs
    // it (the common happy-path attribution never touches order_items or
    // vendors at all), and only once even if somehow read twice.
    let purchaseDetailCache: OrderPurchaseDetail | null = null;
    async function purchaseDetail(): Promise<OrderPurchaseDetail> {
      if (!purchaseDetailCache) {
        purchaseDetailCache = await resolveOrderPurchaseDetail(service, orderId, order!.paid_at, order!.created_at);
      }
      return purchaseDetailCache;
    }

    const clickId = order.affiliate_click_id ?? (await tryReadClickIdCookie());
    if (!clickId) return; // nobody referred them

    const { data: click } = await service
      .from('affiliate_clicks')
      .select('id, created_at, link_id')
      .eq('id', clickId)
      .maybeSingle();
    if (!click) return;

    const { data: link } = await service
      .from('affiliate_links')
      .select('user_id, is_active')
      .eq('id', click.link_id)
      .maybeSingle();
    if (!link) return;
    const linkOwnerId = link.user_id as string;

    // LINK-DISABLED GUARD — live-found gap (2026-08-20): the link may have
    // been disabled AFTER this click but BEFORE this order paid (e.g. an
    // admin confirmed an unrelated fraud flag on this link in between, or
    // the vendor-ineligibility/fraud-sweep auto-disable path ran). A click
    // this old still has its mw_ref cookie sitting in a legitimate buyer's
    // browser regardless — "Confirm & disable" is meant to stop ALL future
    // payouts from this link, not just future clicks, so that purchase must
    // not still pay out just because the click predates the disable.
    if (link.is_active === false) {
      await logFraudFlag(service, {
        linkId: click.link_id,
        userId: linkOwnerId,
        orderId,
        flagType: 'link_disabled_at_payout',
        severity: 'low', // not new evidence — the link was already flagged/disabled by the time this ran
        detail: { clickId: click.id, ...(await purchaseDetail()) },
      });
      return;
    }

    // EXPIRY GUARD
    const cookieDays = await getAttributionCookieDays(service);
    const clickAgeMs = Date.now() - new Date(click.created_at).getTime();
    if (clickAgeMs > cookieDays * 86_400_000) {
      await logFraudFlag(service, {
        linkId: click.link_id,
        userId: linkOwnerId,
        orderId,
        flagType: 'expired_attribution',
        severity: 'low',
        detail: { clickId: click.id, clickCreatedAt: click.created_at, cookieDays, clickAgeDays: Math.floor(clickAgeMs / 86_400_000), ...(await purchaseDetail()) },
      });
      return;
    }

    if (order.status !== 'paid' && order.status !== 'completed') return;

    // SELF-REFERRAL GUARD
    if (order.user_id === linkOwnerId) {
      await logFraudFlag(service, {
        linkId: click.link_id,
        userId: linkOwnerId,
        orderId,
        flagType: 'self_referral',
        severity: 'high',
        detail: { buyerId: order.user_id, linkOwnerId, clickId: click.id, ...(await purchaseDetail()) },
      });
      return;
    }

    // VENDOR-INELIGIBILITY GUARD — the real enforcement (team decision
    // 2026-08-01, see lib/affiliate/vendor-role-guard.ts's header for the
    // full reasoning). Fresh query every call, deliberately independent of
    // affiliate_links.is_active — a pre-existing link that hasn't been
    // deactivated yet (lib/affiliate/fraud.ts::runFraudSweep()'s cleanup
    // pass, which runs on its own schedule) must still pay nothing at the
    // moment of payment, not just once cleanup has caught up.
    const ineligibleRole = await getVendorIneligibleRole(service, linkOwnerId);
    if (ineligibleRole) {
      await logFraudFlag(service, {
        linkId: click.link_id,
        userId: linkOwnerId,
        orderId,
        flagType: 'vendor_ineligible',
        severity: 'low', // ineligible, not abusive — same tone as click_cap_reached
        detail: { role: ineligibleRole, buyerId: order.user_id, ...(await purchaseDetail()) },
      });
      // Bonus immediate cleanup — we've just confirmed vendor status anyway,
      // so deactivate right here rather than waiting for the next sweep.
      // The sweep (item 3) still exists to catch links nobody ever tries to
      // use again.
      await autoDisableLink(service, click.link_id, `auto-disabled: link owner is ${ineligibleRole}, ineligible for affiliate commission`, null);
      return;
    }

    // Tiered rate — based on the owner's CONFIRMED referrals as of right now.
    // This is resolved once and written onto the attribution row below;
    // historical commissions never get recomputed if the owner's tier (or
    // the tier's rate) changes later. See lib/affiliate/tier.ts.
    const { rate } = await getTierForUser(service, linkOwnerId);
    const commission = applyPercent(Number(order.total_amount), rate * 100);

    const { data: owner } = await service
      .from('users')
      .select('tier, kyc_status')
      .eq('id', linkOwnerId)
      .maybeSingle();
    if (owner?.kyc_status === 'rejected') return;
    const fullAffiliate = owner?.tier === 'kyc_verified' && owner?.kyc_status === 'approved';
    if (!fullAffiliate) {
      const startOfMonth = new Date();
      startOfMonth.setUTCDate(1);
      startOfMonth.setUTCHours(0, 0, 0, 0);
      const { data: monthlyRows } = await service
        .from('affiliate_attributions')
        .select('commission_amount')
        .eq('status', 'pending')
        .gte('created_at', startOfMonth.toISOString())
        .in('click_id', (await service.from('affiliate_clicks').select('id').eq('link_id', click.link_id)).data?.map((row) => row.id) ?? []);
      const monthlyTotal = (monthlyRows ?? []).reduce((sum, row) => sum + Number(row.commission_amount), 0);
      if (monthlyTotal >= LIMITED_MONTHLY_COMMISSION_CAP_RM || monthlyTotal + commission > LIMITED_MONTHLY_COMMISSION_CAP_RM) return;
    }

    const { data: attribution, error: attrErr } = await service
      .from('affiliate_attributions')
      .insert({
        click_id: click.id,
        order_id: orderId,
        commission_rate: rate,
        commission_amount: commission,
        status: 'pending',
      })
      .select('id')
      .single();

    if (attrErr) {
      // DUPLICATE-PAYOUT GUARD: 23505 = unique_violation on order_id. This
      // order was already attributed by a previous call — not an error.
      if (attrErr.code === '23505') {
        await logFraudFlag(service, {
          linkId: click.link_id,
          userId: linkOwnerId,
          orderId,
          flagType: 'duplicate_attribution',
          severity: 'medium',
          detail: { clickId: click.id, orderId, pgErrorCode: attrErr.code, ...(await purchaseDetail()) },
        });
        return;
      }
      throw attrErr;
    }
    if (!attribution) return;

    // CLAUDE-P4-EXTRAS.md Extra 3: fire-and-forget, never throws (see
    // lib/affiliate/notifications.ts's own header) — a notification failure
    // must not undo or mask the attribution that was just created above.
    await notifyCommissionEarned(service, { userId: linkOwnerId, amountRM: commission, attributionId: attribution.id as string });

    // No wallet credit here anymore — see the Phase 2 note at the top of
    // this file. The mw_ref cookie is still cleared (best-effort — it may
    // not even be set if the click came from orders.affiliate_click_id):
    // that's about preventing a second purchase in the same browser session
    // from re-attributing off the same click, unrelated to when the wallet
    // actually gets credited.
    await tryClearClickIdCookie();
  } catch (error) {
    console.error('[affiliate] onOrderPaid failed', error instanceof Error ? error.message : error);
  }
}
