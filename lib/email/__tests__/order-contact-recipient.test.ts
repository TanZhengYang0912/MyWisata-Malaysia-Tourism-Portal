import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  orderContactEmail: null as string | null,
  orderLookupError: false,
  enqueueEmail: vi.fn(async () => undefined),
  rpc: vi.fn(),
}));

vi.mock('@/lib/email/outbox', () => ({ enqueueEmail: mocks.enqueueEmail, processEmailOutbox: vi.fn(async () => undefined) }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const single = table === 'users'
        ? { data: { email: 'account@example.com', full_name: 'Account Holder' }, error: null }
        : { data: mocks.orderLookupError ? null : { contact_email: mocks.orderContactEmail }, error: mocks.orderLookupError ? new Error('order_lookup_failed') : null };
      const chain = { select: () => chain, eq: () => chain, single: async () => single, maybeSingle: async () => single };
      return chain;
    },
  }),
}));

const { enqueueUserTransactionEmail } = await import('@/lib/email/events');
const send = (orderId?: string) => enqueueUserTransactionEmail({
  eventKey: 'checkout:1', userId: 'user-1', eventType: 'checkout_succeeded', amountRm: 100, reference: 'order-1', orderId,
} as Parameters<typeof enqueueUserTransactionEmail>[0]);

describe('signed-in order email recipient', () => {
  beforeEach(() => {
    mocks.enqueueEmail.mockClear();
    mocks.orderContactEmail = null;
    mocks.orderLookupError = false;
  });

  it('uses one server-owned canonical receipt for order payment instead of a provider notice', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await send('order-1');
    expect(mocks.rpc).toHaveBeenCalledWith('queue_order_receipt', { p_order_id: 'order-1' });
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
  });

  it('retains the account email fallback for ordinary non-order notifications', async () => {
    await send();
    expect(mocks.enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({ toEmail: 'account@example.com' }));
  });

  it('queues ordinary notifications without a recipient language', async () => {
    await send();
    expect(mocks.enqueueEmail).not.toHaveBeenCalledWith(expect.objectContaining({ locale: expect.anything() }));
    expect(mocks.enqueueEmail).toHaveBeenCalled();
  });

  it('reports receipt persistence failure instead of creating an untracked notice', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(send('order-1')).rejects.toThrow('receipt_queue_unavailable');
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
  });
});
