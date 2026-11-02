export type DashboardPayment = {
  status?: string | null;
  provider?: string | null;
  is_live?: boolean | null;
};

export type DashboardSaleClass = 'verified' | 'simulated' | 'unverified' | 'excluded';
export type DashboardSalesMode = 'live' | 'demo';

export function normalizeDashboardSalesMode(value: unknown): DashboardSalesMode {
  return value === 'demo' ? 'demo' : 'live';
}

export function matchesDashboardSalesMode(sale: DashboardSaleClass, mode: DashboardSalesMode): boolean {
  return sale === (mode === 'demo' ? 'simulated' : 'verified');
}
export type DashboardPaymentMode = 'live' | 'test' | 'demo' | 'mixed' | 'unknown';
export type DashboardPaymentProvider = 'demo' | 'stripe' | 'tng' | 'grabpay' | 'bank_transfer' | 'other' | 'mixed' | 'unknown';

export type DashboardPaymentSummary = {
  status: string;
  mode: DashboardPaymentMode;
  provider: DashboardPaymentProvider;
};

export type DashboardRevenueLine = {
  id: string;
  order_id: string;
  line_total: number | string;
  orders?: { subtotal?: number | string | null; total_amount?: number | string | null } | null;
};

function paymentProviderKey(provider: string | null | undefined): DashboardPaymentProvider {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized === 'demo') return 'demo';
  if (normalized.includes('stripe')) return 'stripe';
  if (normalized.includes('tng')) return 'tng';
  if (normalized.includes('grabpay')) return 'grabpay';
  if (normalized.includes('bank_transfer')) return 'bank_transfer';
  return 'other';
}

function paymentMode(payment: DashboardPayment): Exclude<DashboardPaymentMode, 'mixed'> {
  const provider = payment.provider?.trim().toLowerCase();
  if (!provider) return 'unknown';
  if (provider === 'demo') return 'demo';
  if (payment.is_live === true) return 'live';
  if (payment.is_live === false) return 'test';
  return 'unknown';
}

/** Summarizes successful payment provenance while retaining pending-only context. */
export function summarizeDashboardPayments(payments: DashboardPayment[] | null | undefined): DashboardPaymentSummary {
  const records = payments ?? [];
  const successfulPayments = records.filter((payment) => payment.status === 'succeeded');
  const relevantPayments = successfulPayments.length ? successfulPayments : records;
  if (!relevantPayments.length) return { status: 'not_recorded', mode: 'unknown', provider: 'unknown' };

  const statuses = [...new Set(relevantPayments.map((payment) => payment.status?.trim().toLowerCase()).filter(Boolean))];
  const providers = [...new Set(relevantPayments.map((payment) => paymentProviderKey(payment.provider)))];
  const modes = [...new Set(relevantPayments.map(paymentMode))];

  return {
    status: successfulPayments.length ? 'succeeded' : statuses.length === 1 ? statuses[0] || 'unknown' : 'mixed',
    mode: modes.length === 1 ? modes[0] : 'mixed',
    provider: providers.length === 1 ? providers[0] : 'mixed',
  };
}

/** Mirrors the payment-provenance rule used by vendor settlement records. */
export function classifyDashboardSale(orderStatus: string | null | undefined, payments: DashboardPayment[] | null | undefined): DashboardSaleClass {
  if (!['paid', 'completed'].includes(orderStatus ?? '')) return 'excluded';

  const successfulPayments = (payments ?? []).filter((payment) => payment.status === 'succeeded');
  if (!successfulPayments.length) return 'unverified';

  const modes = successfulPayments.map(paymentMode);
  if (modes.every((mode) => mode === 'live')) return 'verified';
  if (modes.every((mode) => mode === 'demo' || mode === 'test')) return 'simulated';

  // Unknown or mixed successful sources cannot safely attribute the full order
  // value to either view. Switching the display must not turn them into sales.
  return 'unverified';
}

/**
 * Allocate the settled order total across the visible order lines by their
 * subtotal weight. This matches the vendor settlement's pro-rata discount
 * allocation while preserving cents across the lines in the current scope.
 */
export function allocateDashboardRevenue<T extends DashboardRevenueLine>(lines: T[]): Map<string, number> {
  const groups = new Map<string, T[]>();
  for (const line of lines) groups.set(line.order_id, [...(groups.get(line.order_id) ?? []), line]);

  const revenue = new Map<string, number>();
  for (const orderLines of groups.values()) {
    const subtotal = Number(orderLines[0]?.orders?.subtotal);
    const totalAmount = Number(orderLines[0]?.orders?.total_amount);
    const weights = orderLines.map((line) => Math.max(0, Number(line.line_total) || 0));
    const visibleSubtotal = weights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(totalAmount) || totalAmount < 0 || !visibleSubtotal) {
      for (const line of orderLines) revenue.set(line.id, 0);
      continue;
    }

    const targetCents = Math.round(totalAmount * (visibleSubtotal / subtotal) * 100);
    const allocations = weights.map((weight, index) => {
      const exactCents = targetCents * (weight / visibleSubtotal);
      const cents = Math.floor(exactCents);
      return { id: orderLines[index].id, cents, remainder: exactCents - cents };
    });
    let remainderCents = targetCents - allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
    const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
    for (const allocation of byRemainder) {
      if (remainderCents <= 0) break;
      allocation.cents += 1;
      remainderCents -= 1;
    }
    for (const allocation of allocations) revenue.set(allocation.id, allocation.cents / 100);
  }
  return revenue;
}
