import type { SupabaseClient } from '@supabase/supabase-js';

export async function attributeRecommendationReward(service: SupabaseClient, orderId: string) {
  const { data: order } = await service.from('orders').select('id,status,total_amount').eq('id', orderId).maybeSingle();
  if (!order || !['paid', 'completed', 'PAID', 'COMPLETED'].includes(order.status)) return { kind: 'skipped' as const };
  const { data: items } = await service.from('order_items').select('vendor_id,line_total').eq('order_id', orderId);
  const vendorTotals = new Map<string, number>();
  for (const item of (items ?? []) as Array<{ vendor_id?: string | null; line_total?: number | string | null }>) {
    if (!item.vendor_id) continue;
    const lineTotal = Number(item.line_total);
    if (Number.isFinite(lineTotal) && lineTotal >= 0) {
      vendorTotals.set(item.vendor_id, (vendorTotals.get(item.vendor_id) ?? 0) + lineTotal);
    } else if (!vendorTotals.has(item.vendor_id)) {
      // Legacy order rows may not have a line total. Preserve a safe fallback
      // only for a single-vendor order; never allocate the full order total to
      // every vendor in a multi-vendor order.
      vendorTotals.set(item.vendor_id, 0);
    }
  }
  const vendorIds = [...vendorTotals.keys()];
  const { data: recommendationRule } = await service
    .from('commission_rules')
    .select('ongoing_rate')
    .eq('rule_type', 'recommendation')
    .eq('tier_name', 'standard')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const configuredRate = Number(recommendationRule?.ongoing_rate);
  const ongoingRate = Number.isFinite(configuredRate) && configuredRate > 0 && configuredRate <= 1
    ? configuredRate
    : 0.03;
  const rewards: Array<{ commissionId: string; recommenderId: string; amountSen: number }> = [];
  for (const vendorId of vendorIds) {
    // There can be historical conversion rows for one vendor. Select only the
    // currently active window, newest first; an unconstrained maybeSingle()
    // would fail as soon as the vendor is relinked after an old window closes.
    const { data: conversion } = await service
      .from('recommendation_conversions')
      .select('id,recommendation_id,first_sale_awarded_at,attribution_ends_at,vendor_recommendations(recommender_id)')
      .eq('converted_vendor_id', vendorId)
      .or(`attribution_ends_at.is.null,attribution_ends_at.gt.${new Date().toISOString()}`)
      .order('converted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conversion) continue;
    if (conversion.attribution_ends_at && new Date(conversion.attribution_ends_at).getTime() <= Date.now()) continue;
    const recommenderId = (conversion.vendor_recommendations as { recommender_id?: string } | null)?.recommender_id;
    if (!recommenderId) continue;
    const firstSale = !conversion.first_sale_awarded_at;
    const vendorTotal = vendorTotals.get(vendorId) ?? 0;
    const amountSen = firstSale ? 5000 : Math.round(vendorTotal * 100 * ongoingRate);
    if (amountSen <= 0) continue;
    const { data: commissionId, error } = await service.rpc('credit_pending_recommendation', { p_user_id: recommenderId, p_amount_sen: amountSen, p_commission_type: firstSale ? 'bonus' : 'ongoing', p_conversion_id: conversion.id, p_order_id: orderId, p_commission_rate: firstSale ? null : ongoingRate, p_note: firstSale ? 'Recommendation first-sale bonus' : 'Recommendation ongoing commission' });
    if (!error && commissionId) rewards.push({ commissionId: String(commissionId), recommenderId, amountSen });
    if (error?.code === '23505') continue;
    if (error) console.error('[recommendation-reward] attribution failed', error.message);
  }
  if (rewards.length > 0) return { kind: 'created' as const, rewards };
  return { kind: 'skipped' as const };
}
