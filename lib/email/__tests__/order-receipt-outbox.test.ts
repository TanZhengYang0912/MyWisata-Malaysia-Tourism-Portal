import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), receipt: vi.fn(), transaction: vi.fn(), pickup: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/platform/operations-settings', () => ({ isPlatformOperationEnabled: async () => false, PLATFORM_OPERATION_KEYS: { pauseCustomDelivery: 'email.pause_custom_delivery' } }));
vi.mock('@/lib/checkout/order-pickup-passes', () => ({ loadOrderPickupPasses: mocks.pickup }));
vi.mock('@/lib/payments/app-url', () => ({ resolvePaymentAppUrl: () => 'https://portal.example.test' }));
vi.mock('@/lib/email/order-receipt', () => ({ sendOrderReceiptEmail: mocks.receipt }));
vi.mock('@/lib/email/sender', () => ({ sendTransactionEmail: mocks.transaction, sendAccountEmail: vi.fn(), sendRecommendationEmail: vi.fn(), sendVendorEmail: vi.fn(), sendKycSecurityEmail: vi.fn() }));
import { processEmailOutbox } from '../outbox';

const owner = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const row = { id: 'queue-test', lease_token: 'lease-test', user_id: owner, to_email: 'buyer@example.test', attempts: 1, event_type: 'checkout_succeeded', payload: { receiptOrderId: orderId, reference: orderId, locale: 'ms' } };
const order = { id: orderId, user_id: owner, guest_subject_id: null, status: 'paid', contact_email: 'buyer@example.test', contact_name: 'Buyer', created_at: '2026-10-24T00:00:00Z', subtotal: 25, discount_amount: 0, total_amount: 25, payment_method: 'bank_transfer', order_items: [{ product_name: 'Synthetic item', variant_name: null, unit_price: 25, quantity: 1 }] };
let claimed: Omit<typeof row, 'user_id' | 'payload'> & { user_id: string | null; payload: typeof row.payload & { guestAccessToken?: string; reason?: string } };
let result: (Omit<typeof order, 'user_id' | 'guest_subject_id'> & { user_id: string | null; guest_subject_id: string | null }) | null;
let filters: Array<[string, string, unknown]>;

describe('durable PDF receipt dispatch', () => {
  beforeEach(() => {
    vi.resetAllMocks(); claimed = structuredClone(row); result = structuredClone(order); filters = [];
    const query = { select: vi.fn(() => query), eq: vi.fn((key, value) => { filters.push(['eq', key, value]); return query; }), is: vi.fn((key, value) => { filters.push(['is', key, value]); return query; }), single: vi.fn(async () => ({ data: result, error: null })) };
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockImplementation(async (name) => ({ data: name.startsWith('claim_email_outbox_delivery_v2') ? { rows: [claimed], reviewRequired: 0 } : true, error: null }));
    mocks.pickup.mockResolvedValue({ foodOrders: [], eventPickups: [], retailPickups: [] });
    mocks.receipt.mockImplementation(async (input) => { await input.delivery.beforeSend(); return { id: 'accepted-test' }; });
  });
  it('sends a paid registered order as a PDF through the receipt-aware lease', async () => {
    expect(await processEmailOutbox()).toEqual({ sent: 1, failed: 0, reviewRequired: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_email_outbox_delivery_v2', { p_limit: 2 });
    expect(filters).toContainEqual(['eq', 'id', orderId]);
    expect(filters).toContainEqual(['eq', 'user_id', owner]);
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: row.to_email, orderId, locale: 'ms', total: 25, accessUrl: `https://portal.example.test/customer/orders/${orderId}` }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(['pending_payment', 'cancelled', 'refunded'])('never emails a receipt for %s', async (status) => {
    result!.status = status;
    expect((await processEmailOutbox()).sent).toBe(0);
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('never emails an order whose contact differs from the queued recipient', async () => {
    result!.contact_email = 'other@example.test';
    expect((await processEmailOutbox()).sent).toBe(0);
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it('falls back only to the exact owner account when the order has no contact snapshot', async () => {
    result!.contact_email = '';
    const orders = mocks.from.getMockImplementation()!;
    const accountQuery = { select: vi.fn(() => accountQuery), eq: vi.fn(() => accountQuery), single: async () => ({ data: { email: row.to_email }, error: null }) };
    mocks.from.mockImplementation((table) => table === 'users' ? accountQuery : orders(table));
    expect((await processEmailOutbox()).sent).toBe(1);
    expect(accountQuery.eq).toHaveBeenCalledWith('id', owner);
  });
  it('keeps a requested Guest receipt as PDF even when a reason exists', async () => {
    claimed = { ...claimed, user_id: null, payload: { ...claimed.payload, guestAccessToken: 'synthetic-only', reason: 'Your requested order receipt.' } };
    result = { ...order, user_id: null, guest_subject_id: 'guest-test' };
    await processEmailOutbox();
    expect(filters).toContainEqual(['is', 'user_id', null]);
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({ accessUrl: 'https://portal.example.test/customer/orders/access#token=synthetic-only' }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('does not expose a registered order when the owner lookup fails', async () => {
    result = null;
    expect((await processEmailOutbox()).sent).toBe(0);
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it.each([false, true])('includes pending retail lines with their exact quantities for Guest=%s', async guest => {
    if (guest) {
      claimed = { ...claimed, user_id: null, payload: { ...claimed.payload, guestAccessToken: 'synthetic-only' } };
      result = { ...order, user_id: null, guest_subject_id: 'guest-test' };
    }
    mocks.pickup.mockResolvedValue({ foodOrders: [], eventPickups: [], retailPickups: [
      { status: 'pending', retailToken: 'synthetic-retail-one', orderItemId: 'line-one', outletName: 'Outlet One', vendorName: 'Vendor One', quantity: 2, name: 'Retail One', variant: 'Box' },
      { status: 'pending', retailToken: 'synthetic-retail-two', orderItemId: 'line-two', outletName: 'Outlet Two', vendorName: 'Vendor Two', quantity: 1, name: 'Retail Two', variant: null },
    ] });
    expect((await processEmailOutbox()).sent).toBe(1);
    const input = mocks.receipt.mock.calls.at(-1)![0];
    expect(input.pickupPasses).toEqual([
      { kind: 'retail', title: 'Outlet One', subtitle: 'Vendor One', details: ['2 × Retail One · Box'], qrUrl: `https://portal.example.test/customer/orders/${orderId}?retail_t=synthetic-retail-one` },
      { kind: 'retail', title: 'Outlet Two', subtitle: 'Vendor Two', details: ['1 × Retail Two'], qrUrl: `https://portal.example.test/customer/orders/${orderId}?retail_t=synthetic-retail-two` },
    ]);
    expect(input.accessUrl).not.toContain('retail_t=');
  });
  it.each(['collected', 'legacy_completed', 'refund_paused', 'unavailable', 'pending'])('does not email an active retail QR for %s without a usable pending pass', async status => {
    mocks.pickup.mockResolvedValue({ foodOrders: [], eventPickups: [], retailPickups: [
      { status, retailToken: status === 'pending' ? null : 'unexpected-token', quantity: 2, name: 'Retail', outletName: 'Outlet', vendorName: 'Vendor' },
    ] });
    expect((await processEmailOutbox()).sent).toBe(1);
    expect(mocks.receipt.mock.calls.at(-1)![0].pickupPasses).toEqual([]);
  });
  it('preserves separate food, event and retail codes in one mixed order receipt', async () => {
    mocks.pickup.mockResolvedValue({
      foodOrders: [{ outletName: 'Cafe', vendorName: 'Food vendor', mode: 'dine_in', foodToken: 'synthetic-food', items: [{ quantity: 1, name: 'Lunch', variant: null }] }],
      eventPickups: [{ vendorName: 'Event vendor', pickupLabels: ['Morning'], pickupDate: '2030-01-01', eventToken: 'synthetic-event', items: [{ quantity: 1, name: 'Event pack' }] }],
      retailPickups: [{ status: 'pending', retailToken: 'synthetic-retail', outletName: 'Shop', vendorName: 'Retail vendor', quantity: 2, name: 'Retail box', variant: null }],
    });
    expect((await processEmailOutbox()).sent).toBe(1);
    const passes = mocks.receipt.mock.calls.at(-1)![0].pickupPasses;
    expect(passes.map((pass: { kind: string }) => pass.kind)).toEqual(['food', 'event', 'retail']);
    for (const [index, parameter, token] of [[0, 'food_t', 'synthetic-food'], [1, 'event_t', 'synthetic-event'], [2, 'retail_t', 'synthetic-retail']] as const) {
      const url = new URL(passes[index].qrUrl);
      expect(url.searchParams.get(parameter)).toBe(token);
      expect([...url.searchParams.keys()]).toEqual([parameter]);
    }
  });
});
