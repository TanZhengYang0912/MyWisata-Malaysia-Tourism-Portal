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
    const orders = query({ data: [{ id: 'order-id-1', status: 'PAID', created_at: '2026-11-01' }], error: null });
    const from = vi.fn(() => orders);

    const result = await queryCustomerSupportStatus({ from } as never, 'signed-in-user', 'orders');

    expect(from).toHaveBeenCalledWith('orders');
    expect(orders.eq).toHaveBeenCalledWith('user_id', 'signed-in-user');
    expect(orders.limit).toHaveBeenCalledWith(5);
    expect(result).toEqual({ state: 'available', items: [expect.objectContaining({ status: 'PAID', href: '/customer/orders/order-id-1' })] });
  });

  it('keeps a failed lookup distinct from an empty account', async () => {
    const failedQuery = query({ data: null, error: new Error('database detail') });
    const emptyQuery = query({ data: [], error: null });

    await expect(queryCustomerSupportStatus({ from: () => failedQuery } as never, 'owner', 'tickets'))
      .resolves.toEqual({ state: 'unavailable', items: [] });
    await expect(queryCustomerSupportStatus({ from: () => emptyQuery } as never, 'owner', 'tickets'))
      .resolves.toEqual({ state: 'no_records', items: [] });
  });

  it('lists the latest refunds across all owned orders through a bounded owner-scoped query', async () => {
    supportRefundsRpc.mockResolvedValue({
      data: [{ id: 'refund-id', order_id: 'older-order-id', status: 'pending', created_at: '2026-11-01' }],
      error: null,
    });

    const result = await queryCustomerSupportStatus({ from: vi.fn() } as never, 'signed-in-user', 'refunds');

    expect(supportRefundsRpc).toHaveBeenCalledWith('list_support_customer_refunds', { p_owner_user_id: 'signed-in-user' });
    expect(result).toEqual({ state: 'available', items: [expect.objectContaining({
      id: 'refund-id', status: 'pending', href: '/customer/orders/older-order-id',
    })] });
  });
});
