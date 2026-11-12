import { describe, expect, it, vi } from 'vitest';
import { queryCustomerSupportStatus } from '../customer-tools';

const supportRefundsRpc = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: supportRefundsRpc }) }));

function query(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder as Record<string, ReturnType<typeof vi.fn>>;
}

describe('queryCustomerSupportStatus', () => {
  it('queries only the signed-in owner records with a database limit', async () => {
    const orders = query({ data: [{ id: 'order-id-1', display_id: 'ORD-1001', status: 'paid', created_at: '2026-11-01' }], error: null });
    const from = vi.fn(() => orders);

    const result = await queryCustomerSupportStatus({ from } as never, 'signed-in-user', 'orders');

    expect(from).toHaveBeenCalledWith('orders');
    expect(orders.select).toHaveBeenCalledWith('id,display_id,status,created_at');
    expect(orders.eq).toHaveBeenCalledWith('user_id', 'signed-in-user');
    expect(orders.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({ state: 'available', items: [expect.objectContaining({
      status: 'paid', label: 'ORD-1001', href: '/customer/orders/order-id-1',
    })] });
  });

  it('uses the public booking reference without reading booking QR or contact data', async () => {
    const bookings = query({ data: [
      { id: 'booking-id-1', display_id: 'BK-1001', status: 'confirmed', created_at: '2026-11-01' },
      { id: 'booking-id-2', display_id: 'BK-1002', status: 'in_use', created_at: '2026-11-02' },
      { id: 'booking-id-3', display_id: 'BK-1003', status: 'no_show', created_at: '2026-11-03' },
    ], error: null });

    const result = await queryCustomerSupportStatus({ from: () => bookings } as never, 'customer-a', 'bookings');

    expect(bookings.select).toHaveBeenCalledWith('id,display_id,status,created_at');
    expect(bookings.eq).toHaveBeenCalledWith('customer_id', 'customer-a');
    expect(bookings.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(bookings.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({ state: 'available', items: [
      expect.objectContaining({ label: 'BK-1001', href: '/customer/bookings/booking-id-1', status: 'confirmed' }),
      expect.objectContaining({ label: 'BK-1002', href: '/customer/bookings/booking-id-2', status: 'in_use' }),
      expect.objectContaining({ label: 'BK-1003', href: '/customer/bookings/booking-id-3', status: 'no_show' }),
    ] });
  });

  it('recognizes the lower-case order statuses stored in FYP', async () => {
    const orders = query({ data: [
      { id: 'order-paid', status: 'paid', created_at: '2026-11-01' },
      { id: 'order-completed', status: 'completed', created_at: '2026-11-02' },
      { id: 'order-cancelled', status: 'cancelled', created_at: '2026-11-03' },
      { id: 'order-refunded', status: 'refunded', created_at: '2026-11-04' },
    ], error: null });

    const result = await queryCustomerSupportStatus({ from: () => orders } as never, 'signed-in-user', 'orders');

    expect(result).toEqual({ state: 'available', items: [
      expect.objectContaining({ status: 'paid', href: '/customer/orders/order-paid' }),
      expect.objectContaining({ status: 'completed', href: '/customer/orders/order-completed' }),
      expect.objectContaining({ status: 'cancelled', href: '/customer/orders/order-cancelled' }),
      expect.objectContaining({ status: 'refunded', href: '/customer/orders/order-refunded' }),
    ] });
  });

  it('keeps a failed lookup distinct from an empty account', async () => {
    const failedQuery = query({ data: null, error: new Error('database detail') });
    const emptyQuery = query({ data: [], error: null });

    await expect(queryCustomerSupportStatus({ from: () => failedQuery } as never, 'owner', 'tickets'))
      .resolves.toEqual({ state: 'unavailable', items: [] });
    await expect(queryCustomerSupportStatus({ from: () => emptyQuery } as never, 'owner', 'tickets'))
      .resolves.toEqual({ state: 'no_records', items: [] });
  });

  it('keeps booking and refund read failures distinct from empty results', async () => {
    const failedBookingQuery = query({ data: null, error: new Error('database detail') });
    const emptyBookingQuery = query({ data: [], error: null });
    const from = vi.fn().mockReturnValueOnce(failedBookingQuery).mockReturnValueOnce(emptyBookingQuery);

    await expect(queryCustomerSupportStatus({ from } as never, 'owner', 'bookings'))
      .resolves.toEqual({ state: 'unavailable', items: [] });
    await expect(queryCustomerSupportStatus({ from } as never, 'owner', 'bookings'))
      .resolves.toEqual({ state: 'no_records', items: [] });

    supportRefundsRpc.mockResolvedValueOnce({ data: null, error: new Error('rpc unavailable') });
    await expect(queryCustomerSupportStatus({ from: vi.fn() } as never, 'owner', 'refunds'))
      .resolves.toEqual({ state: 'unavailable', items: [] });

    supportRefundsRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(queryCustomerSupportStatus({ from: vi.fn() } as never, 'owner', 'refunds'))
      .resolves.toEqual({ state: 'no_records', items: [] });
  });

  it('lists the latest refunds across all owned orders through a bounded owner-scoped query', async () => {
    supportRefundsRpc.mockResolvedValue({
      data: [{
        id: 'refund-id', order_id: 'older-order-id', order_display_id: 'ORD-1002', status: 'pending', created_at: '2026-11-01',
      }],
      error: null,
    });

    const result = await queryCustomerSupportStatus({ from: vi.fn() } as never, 'signed-in-user', 'refunds');

    expect(supportRefundsRpc).toHaveBeenCalledWith('list_support_customer_refunds', { p_owner_user_id: 'signed-in-user' });
    expect(result).toEqual({ state: 'available', items: [expect.objectContaining({
      id: 'refund-id', label: 'ORD-1002', status: 'pending', href: '/customer/orders/older-order-id',
    })] });
  });

  it('continues to render the current RPC response until the display-reference migration is applied', async () => {
    const orderId = '80000000-0000-0000-0000-000000000001';
    supportRefundsRpc.mockResolvedValue({
      data: [{ id: 'refund-id', order_id: orderId, status: 'pending', created_at: '2026-11-01' }],
      error: null,
    });

    const result = await queryCustomerSupportStatus({ from: vi.fn() } as never, 'signed-in-user', 'refunds');

    expect(result).toEqual({ state: 'available', items: [expect.objectContaining({
      label: orderId, href: `/customer/orders/${orderId}`,
    })] });
  });
});
