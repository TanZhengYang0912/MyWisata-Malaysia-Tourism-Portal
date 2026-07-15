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
import { createServiceClient } from '@/lib/supabase/service';
import { applyPercent } from '@/lib/money';
import { getAttributionCookieDays } from './settings';
import { getTierForUser } from './tier';
import { logFraudFlag } from './fraud';

const MW_REF_COOKIE = 'mw_ref';
const LIMITED_MONTHLY_COMMISSION_CAP_RM = 100;

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
      .select('id, user_id, status, total_amount, affiliate_click_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return;

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
      .select('user_id')
      .eq('id', click.link_id)
      .maybeSingle();
    if (!link) return;
    const linkOwnerId = link.user_id as string;

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
        detail: { clickId: click.id, clickCreatedAt: click.created_at, cookieDays, clickAgeDays: Math.floor(clickAgeMs / 86_400_000) },
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
        detail: { buyerId: order.user_id, linkOwnerId, clickId: click.id },
      });
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
          detail: { clickId: click.id, orderId, pgErrorCode: attrErr.code },
        });
        return;
      }
      throw attrErr;
    }
    if (!attribution) return;

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
