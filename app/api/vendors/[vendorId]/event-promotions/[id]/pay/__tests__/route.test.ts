import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  payEventPromotionFromWallet: vi.fn(),
  getEventPromotionCostPerDaySen: vi.fn(),
  customersCreate: vi.fn(),
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
  expirePendingPromotionCheckout: vi.fn(),
  recordPendingPromotionCheckout: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/vendor/event-promotions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vendor/event-promotions')>();
  return { ...actual, payEventPromotionFromWallet: mocks.payEventPromotionFromWallet };
});
vi.mock('@/lib/admin/event-promotions', () => ({ getEventPromotionCostPerDaySen: mocks.getEventPromotionCostPerDaySen }));
vi.mock('@/lib/stripe', () => ({
  stripe: { customers: { create: mocks.customersCreate }, checkout: { sessions: { create: mocks.sessionsCreate, expire: mocks.sessionsExpire } } },
}));
vi.mock('@/lib/vendor/event-promotion-checkout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vendor/event-promotion-checkout')>();
  return {
    ...actual,
    expirePendingPromotionCheckout: mocks.expirePendingPromotionCheckout,
    recordPendingPromotionCheckout: mocks.recordPendingPromotionCheckout,
  };
});
vi.mock('server-only', () => ({}));

import { POST } from '../route';

const vendorId = 'vendor-1';
const promotionId = 'promo-1';
function params() { return { params: Promise.resolve({ vendorId, id: promotionId }) }; }
function payRequest() {
  return new Request('http://localhost/api/vendors/vendor-1/event-promotions/promo-1/pay', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  });
}

describe('POST /api/vendors/[vendorId]/event-promotions/[id]/pay', () => {
  let promotionMaybeSingle: ReturnType<typeof vi.fn>;
  let usersSingle: ReturnType<typeof vi.fn>;
  let usersUpdateEq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    promotionMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: promotionId, title: 'Penang Food Fair', starts_on: '2027-01-15', ends_on: '2027-01-17', status: 'approved' },
      error: null,
    });
    usersSingle = vi.fn().mockResolvedValue({ data: { email: 'v@example.com', full_name: 'Vendor One', stripe_customer_id: null }, error: null });
    usersUpdateEq = vi.fn().mockResolvedValue({ error: null });

    const serviceFrom = vi.fn((table: string) => {
      if (table === 'vendor_event_promotions') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: promotionMaybeSingle };
      }
      if (table === 'users') {
        return { update: vi.fn().mockReturnValue({ eq: usersUpdateEq }) };
      }
      throw new Error(`unexpected service table ${table}`);
    });
    const authFrom = vi.fn((table: string) => {
      if (table === 'users') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: usersSingle };
      }
      throw new Error(`unexpected auth table ${table}`);
    });

    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: 'user-1', vendorId, authDb: { from: authFrom }, serviceDb: { from: serviceFrom } },
    });
    mocks.getEventPromotionCostPerDaySen.mockResolvedValue(10_000);
    mocks.sessionsCreate.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.test/session' });
    mocks.sessionsExpire.mockResolvedValue({});
    mocks.expirePendingPromotionCheckout.mockResolvedValue({ ok: true });
    mocks.recordPendingPromotionCheckout.mockResolvedValue({ ok: true });
    mocks.customersCreate.mockResolvedValue({ id: 'cus_new' });
  });

  it('pays from wallet when there are sufficient earnings, skipping Stripe entirely', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: true, amountSen: 30_000 });
    const response = await POST(payRequest(), params());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ paid: true, method: 'wallet', amountSen: 30_000 });
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 404],
    ['not_payable', 409],
    ['forbidden', 403],
    ['wallet_not_found', 404],
  ] as const)('maps wallet error %s to %i without falling back to Stripe', async (code, status) => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code });
    const response = await POST(payRequest(), params());
    expect(response.status).toBe(status);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('falls back to Stripe checkout on insufficient wallet earnings, charging the full day-count amount', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    const response = await POST(payRequest(), params());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ paid: false, method: 'stripe', checkoutUrl: 'https://checkout.stripe.test/session' });
    // Jan 15 - Jan 17 inclusive = 3 days * RM100/day = 30000 sen.
    expect(mocks.sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 30_000 }) })],
      metadata: { user_id: 'user-1', payment_kind: 'event_promotion', promotion_id: promotionId },
    }));
  });

  it('creates a new Stripe customer when the vendor has none yet, and persists it', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    await POST(payRequest(), params());
    expect(mocks.customersCreate).toHaveBeenCalledOnce();
    expect(usersUpdateEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('reuses an existing Stripe customer id instead of creating a new one', async () => {
    usersSingle.mockResolvedValue({ data: { email: 'v@example.com', full_name: 'Vendor One', stripe_customer_id: 'cus_existing' }, error: null });
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    await POST(payRequest(), params());
    expect(mocks.customersCreate).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }));
  });

  it('rejects Stripe fallback when the promotion is no longer approved', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    promotionMaybeSingle.mockResolvedValue({
      data: { id: promotionId, title: 'x', starts_on: '2027-01-15', ends_on: '2027-01-17', status: 'paid' },
      error: null,
    });
    const response = await POST(payRequest(), params());
    expect(response.status).toBe(409);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('propagates an authorization failure', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });
    const response = await POST(payRequest(), params());
    expect(response.status).toBe(403);
    expect(mocks.payEventPromotionFromWallet).not.toHaveBeenCalled();
  });

  it('expires an earlier open Checkout before paying from the wallet', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: true, amountSen: 30_000 });
    await POST(payRequest(), params());
    expect(mocks.expirePendingPromotionCheckout).toHaveBeenCalledWith(expect.anything(), vendorId, promotionId);
    expect(mocks.expirePendingPromotionCheckout.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.payEventPromotionFromWallet.mock.invocationCallOrder[0]);
  });

  it('refuses to take a second payment while an earlier card payment is completing', async () => {
    mocks.expirePendingPromotionCheckout.mockResolvedValue({ ok: false, reason: 'completed' });
    const response = await POST(payRequest(), params());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PAYMENT_IN_PROGRESS' } });
    expect(mocks.payEventPromotionFromWallet).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it('records the new Checkout session and amount as the only one that may pay', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    await POST(payRequest(), params());
    expect(mocks.recordPendingPromotionCheckout).toHaveBeenCalledWith(expect.anything(), vendorId, promotionId, 'cs_new', 30_000);
  });

  it('expires the new session again when the promotion stopped awaiting payment meanwhile', async () => {
    mocks.payEventPromotionFromWallet.mockResolvedValue({ ok: false, code: 'insufficient_earnings' });
    mocks.recordPendingPromotionCheckout.mockResolvedValue({ ok: false, reason: 'not_payable' });
    const response = await POST(payRequest(), params());
    expect(response.status).toBe(409);
    expect(mocks.sessionsExpire).toHaveBeenCalledWith('cs_new');
  });
});
