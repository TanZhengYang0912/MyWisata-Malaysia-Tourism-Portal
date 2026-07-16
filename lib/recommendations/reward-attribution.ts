import type { SupabaseClient } from '@supabase/supabase-js';

export async function attributeRecommendationReward(service: SupabaseClient, orderId: string) {
  const { data: order } = await service.from('orders').select('id,status,total_amount').eq('id', orderId).maybeSingle();
  if (!order || !['paid', 'completed', 'PAID', 'COMPLETED'].includes(order.status)) return { kind: 'skipped' as const };
  const { data: items } = await service.from('order_items').select('vendor_id').eq('order_id', orderId);
  const vendorIds = [...new Set((items ?? []).map((item) => item.vendor_id))];
  const rewards: Array<{ commissionId: string; recommenderId: string; amountSen: number }> = [];
  for (const vendorId of vendorIds) {
    const { data: conversion } = await service.from('recommendation_conversions').select('id,recommendation_id,first_sale_awarded_at,attribution_ends_at,vendor_recommendations(recommender_id)').eq('converted_vendor_id', vendorId).maybeSingle();
    if (!conversion) continue;
    if (conversion.attribution_ends_at && new Date(conversion.attribution_ends_at).getTime() < Date.now()) continue;
    const recommenderId = (conversion.vendor_recommendations as { recommender_id?: string } | null)?.recommender_id;
    if (!recommenderId) continue;
    const firstSale = !conversion.first_sale_awarded_at;
    const amountSen = firstSale ? 5000 : Math.round(Number(order.total_amount) * 3);
    const { data: commissionId, error } = await service.rpc('credit_pending_recommendation', { p_user_id: recommenderId, p_amount_sen: amountSen, p_commission_type: firstSale ? 'bonus' : 'ongoing', p_conversion_id: conversion.id, p_order_id: orderId, p_commission_rate: firstSale ? null : 0.03, p_note: firstSale ? 'Recommendation first-sale bonus' : 'Recommendation ongoing commission' });
    if (!error && commissionId) rewards.push({ commissionId: String(commissionId), recommenderId, amountSen });
    if (error?.code === '23505') continue;
    if (error) console.error('[recommendation-reward] attribution failed', error.message);
  }
  if (rewards.length > 0) return { kind: 'created' as const, rewards };
  return { kind: 'skipped' as const };
}
