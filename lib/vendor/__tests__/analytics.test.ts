import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsSnapshot,
  type AnalyticsInput,
} from '@/lib/vendor/analytics';

const input: AnalyticsInput = {
  range: {
    start: '2026-08-01T00:00:00+08:00',
    end: '2026-08-31T23:59:59+08:00',
  },
  outlets: [
    { id: 'outlet-a', name: 'George Town', city: 'George Town', state: 'Penang' },
    { id: 'outlet-b', name: 'Batu Ferringhi', city: 'Batu Ferringhi', state: 'Penang' },
  ],
  products: [
    { id: 'product-a', name: 'Heritage Walk', base_price: 80, status: 'active', outlet_id: 'outlet-a' },
    { id: 'product-b', name: 'Sunset Cruise', base_price: 120, status: 'active', outlet_id: 'outlet-b' },
  ],
  items: [
    { order_id: 'order-1', outlet_id: 'outlet-a', product_id: 'product-a', product_name: 'Heritage Walk', quantity: 2, line_total: 160, created_at: '2026-08-04T10:00:00+08:00', slot_starts_at: null, order_status: 'completed' },
    { order_id: 'order-2', outlet_id: 'outlet-a', product_id: 'product-a', product_name: 'Heritage Walk', quantity: 1, line_total: 80, created_at: '2026-08-04T10:30:00+08:00', slot_starts_at: '2026-08-05T14:00:00+08:00', order_status: 'paid' },
    { order_id: 'order-3', outlet_id: 'outlet-b', product_id: 'product-b', product_name: 'Sunset Cruise', quantity: 1, line_total: 120, created_at: '2026-08-18T18:00:00+08:00', slot_starts_at: null, order_status: 'paid' },
  ],
  reviews: [
    { product_id: 'product-a', rating: 5, created_at: '2026-08-05T12:00:00+08:00' },
    { product_id: 'product-a', rating: 4, created_at: '2026-08-06T12:00:00+08:00' },
    { product_id: 'product-b', rating: 3, created_at: '2026-08-19T12:00:00+08:00' },
  ],
};

describe('vendor analytics aggregation', () => {
  it('builds revenue, order and average-order-value trend points without duplicating order lines', () => {
    const snapshot = buildAnalyticsSnapshot(input);

    expect(snapshot.trend).toHaveLength(2);
    expect(snapshot.metrics.revenue).toBe(360);
    expect(snapshot.metrics.orders).toBe(3);
    expect(snapshot.metrics.averageOrderValue).toBe(120);
    expect(snapshot.trend[0]).toMatchObject({ revenue: 240, orders: 2, averageOrderValue: 120 });
  });

  it('calculates booking mix, demand cells, product portfolio and outlet performance', () => {
    const snapshot = buildAnalyticsSnapshot(input);

    expect(snapshot.bookingMix).toMatchObject({ bookedOrders: 1, nonBookedOrders: 2, bookingShare: 33.3 });
    expect(snapshot.demand.some((cell) => cell.orders === 2 && cell.weekday === 1 && cell.hour === 10)).toBe(true);
    expect(snapshot.products[0]).toMatchObject({ name: 'Heritage Walk', units: 3, revenue: 240, rating: 4.5 });
    expect(snapshot.outlets[0]).toMatchObject({ name: 'George Town', orders: 2, revenue: 240, averageOrderValue: 120 });
  });

  it('keeps rating distribution explicit and selects useful, data-backed insights', () => {
    const snapshot = buildAnalyticsSnapshot(input);

    expect(snapshot.ratingDistribution).toEqual([
      { rating: 5, count: 1 },
      { rating: 4, count: 1 },
      { rating: 3, count: 1 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
    expect(snapshot.insights.map((insight) => insight.kind)).toEqual(['top_product', 'peak_window', 'outlet_concentration']);
  });
});
