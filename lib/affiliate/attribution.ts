// onOrderPaid() is the single integration point called from the checkout flow.
// It coordinates two independent attribution pipelines:
//   1. Affiliate link attribution (orders.affiliate_click_id, tier-rated commission)
//   2. Recommendation attribution (vendor conversion bonus + 90-day ongoing)
//
// Contract: accepts only orderId. Both pipelines are idempotent — calling
// onOrderPaid(orderId) multiple times is safe (duplicate inserts are rejected
// by unique indexes on affiliate_attributions and recommendation_commissions).
//
// Checkout owners: write the mw_ref cookie value to orders.affiliate_click_id
// at order-creation time. onOrderPaid() reads from that column, not from
// browser cookies, so it is callable from any context (webhooks, cron, admin).

import { createServiceClient } from '@/lib/supabase/service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyPercent, roundSen } from '@/lib/money';
import { getAttributionCookieDays, getEarningsHoldDays } from './settings';
import { computeAffiliateTier } from './commission';
import { creditPendingCommission } from './wallet-credit';

export async function onOrderPaid(orderId: string): Promise<void> {
  try {
    const service = createServiceClient();
    await Promise.allSettled([
      processAffiliateAttribution(service, orderId),
      processRecommendationAttribution(service, orderId),
    ]);
  } catch (error) {
    console.error('[attribution] onOrderPaid failed', error instanceof Error ? error.message : error);
  }
}

// ── 1. Affiliate attribution ──────────────────────────────────────────────────

async function processAffiliateAttribution(service: SupabaseClient, orderId: string): Promise<void> {
  // Fetch order along with the click ID written at checkout creation time.
  // affiliate_click_id is set by whoever creates the order (checkout owner)
  // from the mw_ref cookie — it is NOT read from cookies here.
  const { data: order } = await service
    .from('orders')
    .select('id, user_id, status, total_amount, affiliate_click_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order?.affiliate_click_id) return;
  if (order.status !== 'paid' && order.status !== 'completed') return;

  const clickId = order.affiliate_click_id as string;

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

  const cookieDays = await getAttributionCookieDays(service);
  const clickAgeMs = Date.now() - new Date(click.created_at).getTime();
  if (clickAgeMs > cookieDays * 86_400_000) return;

  if (order.user_id === linkOwnerId) return; // self-referral guard

  const rate       = await computeAffiliateTier(service, linkOwnerId);
  const commission = applyPercent(Number(order.total_amount), rate * 100);
  const holdDays   = await getEarningsHoldDays(service);
  const holdUntil  = new Date(Date.now() + holdDays * 86_400_000).toISOString();

  const { data: attribution, error: attrErr } = await service
    .from('affiliate_attributions')
    .insert({
      click_id:          click.id,
      order_id:          orderId,
      commission_rate:   rate,
      commission_amount: commission,
      status:            'pending',
      hold_until:        holdUntil,
    })
    .select('id')
    .single();

  if (attrErr) {
    if (attrErr.code === '23505') return; // duplicate — idempotent
    throw attrErr;
  }
  if (!attribution) return;

  await creditPendingCommission(service, linkOwnerId, commission, orderId);
}

// ── 2. Recommendation attribution ─────────────────────────────────────────────

async function processRecommendationAttribution(service: SupabaseClient, orderId: string): Promise<void> {
  const { data: order } = await service
    .from('orders')
    .select('user_id, total_amount, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return;
  if (order.status !== 'paid' && order.status !== 'completed') return;

  const { data: items } = await service
    .from('order_items')
    .select('outlet_id')
    .eq('order_id', orderId);
  if (!items?.length) return;

  const outletIds = [...new Set(items.map((i: any) => i.outlet_id).filter(Boolean))];
  if (!outletIds.length) return;

  const { data: outlets } = await service
    .from('outlets')
    .select('vendor_id')
    .in('id', outletIds);
  if (!outlets?.length) return;

  const vendorIds = [...new Set(outlets.map((o: any) => o.vendor_id).filter(Boolean))];

  await Promise.allSettled(
    vendorIds.map((vendorId) =>
      creditRecommendationForVendor(service, vendorId, orderId, order.user_id, Number(order.total_amount))
    ),
  );
}

async function creditRecommendationForVendor(
  service:    SupabaseClient,
  vendorId:   string,
  orderId:    string,
  buyerId:    string,
  orderTotal: number,
): Promise<void> {
  const { data: conversion } = await service
    .from('recommendation_conversions')
    .select('id, recommendation_id, attribution_ends_at')
    .eq('converted_vendor_id', vendorId)
    .gt('attribution_ends_at', new Date().toISOString())
    .maybeSingle();
  if (!conversion) return;

  const { data: rec } = await service
    .from('vendor_recommendations')
    .select('recommender_id')
    .eq('id', conversion.recommendation_id)
    .maybeSingle();
  if (!rec) return;

  if (rec.recommender_id === buyerId) return; // self-referral guard

  // RM 50 first-sale bonus — idempotent via uniq_rec_comm_bonus index.
  // RPC also syncs first_sale_awarded_at on the conversion row.
  await service.rpc('credit_pending_recommendation', {
    p_user_id:         rec.recommender_id,
    p_amount_sen:      5000,
    p_commission_type: 'bonus',
    p_conversion_id:   conversion.id,
    p_order_id:        orderId,
    p_note:            `First-sale RM 50 bonus — vendor ${vendorId.slice(0, 8)}`,
  });

  // Ongoing 3% commission — idempotent via uniq_rec_comm_ongoing index.
  const ONGOING_RATE = 0.03;
  const ongoingSen   = roundSen(orderTotal * ONGOING_RATE);
  if (ongoingSen > 0) {
    await service.rpc('credit_pending_recommendation', {
      p_user_id:         rec.recommender_id,
      p_amount_sen:      ongoingSen,
      p_commission_type: 'ongoing',
      p_conversion_id:   conversion.id,
      p_order_id:        orderId,
      p_commission_rate: ONGOING_RATE,
      p_note:            `Ongoing 3% recommendation commission — order ${orderId.slice(0, 8)}`,
    });
  }
}
