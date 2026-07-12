// P4 — Member 4: conversion + commission. See CLAUDE.md Step 4.
//
// onOrderPaid() is the single integration point the checkout owner should
// eventually call from the end of commerce.ts::createOrder() — see CLAUDE.md
// Section 6. Do not call it from anywhere else in this module except the dev
// purchase simulator (Step 5), and do not refactor createOrder() to add the
// call yourself.
//
// Reads next/headers' cookies() to get mw_ref, so this must be invoked from a
// real server request context (Route Handler / Server Action) — it cannot be
// called from a plain client-side function call.

import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPercent } from '@/lib/money';
import { getAttributionCookieDays } from './settings';
import { getAffiliateCommissionRate } from './commission';
import { creditAffiliateCommission } from './wallet-credit';

const MW_REF_COOKIE = 'mw_ref';

/**
 * Safe to call twice for the same order (the UNIQUE(order_id) constraint on
 * affiliate_attributions — migration 009 — makes the second call a no-op).
 * Never throws into the caller's checkout flow.
 */
export async function onOrderPaid(orderId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    const clickId = cookieStore.get(MW_REF_COOKIE)?.value;
    if (!clickId) return; // nobody referred them

    // Service-role throughout: affiliate_links only has an owner-only SELECT
    // policy, and this hook has no reason to run as any particular user's
    // session anyway (it credits a third party's wallet). See CLAUDE.md
    // Section 2 for the full per-table RLS/grants breakdown.
    const service = createServiceClient();

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
    if (clickAgeMs > cookieDays * 86_400_000) return;

    const { data: order } = await service
      .from('orders')
      .select('id, user_id, status, total_amount')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return;
    if (order.status !== 'paid' && order.status !== 'completed') return;

    // SELF-REFERRAL GUARD
    if (order.user_id === linkOwnerId) return;

    const rate = await getAffiliateCommissionRate(service);
    const commission = applyPercent(Number(order.total_amount), rate * 100);

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
      if (attrErr.code === '23505') return;
      throw attrErr;
    }
    if (!attribution) return;

    await creditAffiliateCommission(service, linkOwnerId, commission, orderId);

    cookieStore.delete(MW_REF_COOKIE);
  } catch (error) {
    console.error('[affiliate] onOrderPaid failed', error instanceof Error ? error.message : error);
  }
}
