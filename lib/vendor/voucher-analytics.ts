export interface VoucherAnalyticsSeed {
  id: string;
  code: string;
  name: string;
  maxUses: number | null;
  outletName: string;
}

export interface VoucherAnalyticsEvent {
  voucherId: string;
  eventType: string;
  userId: string | null;
}

export interface VoucherAnalyticsRedemption {
  voucherId: string;
  discount: number | null;
  revenue: number | null;
  userId: string | null;
}

export interface VoucherAnalyticsRow {
  voucherId: string;
  code: string;
  name: string;
  outletName: string;
  views: number;
  entries: number;
  applies: number;
  redemptions: number;
  uniqueCustomers: number;
  redemptionRate: number | null;
  discount: number;
  revenue: number;
  revenueImpact: number;
}

export function aggregateVoucherAnalytics(
  vouchers: VoucherAnalyticsSeed[],
  events: VoucherAnalyticsEvent[],
  redemptions: VoucherAnalyticsRedemption[],
): VoucherAnalyticsRow[] {
  const customerSets = new Map<string, Set<string>>();
  const result = new Map<string, VoucherAnalyticsRow>();

  for (const voucher of vouchers) {
    result.set(voucher.id, {
      voucherId: voucher.id,
      code: voucher.code,
      name: voucher.name,
      outletName: voucher.outletName,
      views: 0,
      entries: 0,
      applies: 0,
      redemptions: 0,
      uniqueCustomers: 0,
      redemptionRate: voucher.maxUses ? 0 : null,
      discount: 0,
      revenue: 0,
      revenueImpact: 0,
    });
    customerSets.set(voucher.id, new Set());
  }

  for (const event of events) {
    const current = result.get(event.voucherId);
    if (!current) continue;
    if (event.eventType === 'viewed') current.views += 1;
    if (event.eventType === 'entered') current.entries += 1;
    if (event.eventType === 'apply_success') current.applies += 1;
    if (event.userId) customerSets.get(event.voucherId)?.add(event.userId);
  }

  for (const redemption of redemptions) {
    const current = result.get(redemption.voucherId);
    if (!current) continue;
    current.redemptions += 1;
    current.discount += Number(redemption.discount || 0);
    current.revenue += Number(redemption.revenue || 0);
    if (redemption.userId) customerSets.get(redemption.voucherId)?.add(redemption.userId);
    const seed = vouchers.find((voucher) => voucher.id === redemption.voucherId);
    current.redemptionRate = seed?.maxUses ? Number(((current.redemptions / seed.maxUses) * 100).toFixed(1)) : null;
  }

  for (const [voucherId, customers] of customerSets) {
    const current = result.get(voucherId);
    if (current) {
      current.uniqueCustomers = customers.size;
      current.revenueImpact = current.revenue - current.discount;
    }
  }

  return Array.from(result.values()).sort((a, b) => b.redemptions - a.redemptions || b.revenue - a.revenue);
}
