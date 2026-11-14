import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), expirePendingPromotionCheckout: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/stripe', () => ({ stripe: {} }));
vi.mock('@/lib/vendor/event-promotion-checkout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vendor/event-promotion-checkout')>();
  return { ...actual, expirePendingPromotionCheckout: mocks.expirePendingPromotionCheckout };
});

import { PATCH } from '../route';

const vendorId = 'vendor-1';
const promotionId = 'promo-1';
function params() { return { params: Promise.resolve({ vendorId, id: promotionId }) }; }

const resubmission = {
  title: 'Penang Food Fair (corrected)',
  details: 'Our stall will be at the Penang Food Fair this weekend, booth 12.',
  startDate: '2027-01-15',
  endDate: '2027-01-17',
  posterUrl: 'https://storage.example/event-posters/vendor-1/poster-v2.png',
};

function patchRequest(body: unknown = resubmission) {
  return new Request('http://localhost/api/vendors/vendor-1/event-promotions/promo-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/vendors/[vendorId]/event-promotions/[id]', () => {
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: 'user-1', vendorId, authDb: { rpc }, serviceDb: {} },
    });
    mocks.expirePendingPromotionCheckout.mockResolvedValue({ ok: true });
  });

  it('closes an open Checkout before resubmitting, so the old price cannot be paid', async () => {
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(200);
    expect(mocks.expirePendingPromotionCheckout).toHaveBeenCalledWith({}, vendorId, promotionId);
    expect(mocks.expirePendingPromotionCheckout.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });

  it('does not resubmit while a card payment for the old details is completing', async () => {
    mocks.expirePendingPromotionCheckout.mockResolvedValue({ ok: false, reason: 'completed' });
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('resubmits via the auth-bound client, not a service client', async () => {
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('resubmit_vendor_event_promotion', {
      p_promotion_id: promotionId,
      p_title: resubmission.title,
      p_details: resubmission.details,
      p_starts_on: resubmission.startDate,
      p_ends_on: resubmission.endDate,
      p_poster_url: resubmission.posterUrl,
    });
  });

  it('maps a not_editable RPC error to 409 — cannot edit outside changes_requested', async () => {
    rpc.mockResolvedValue({ error: { message: 'not_editable' } });
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(409);
  });

  it('maps a not_found RPC error to 404', async () => {
    rpc.mockResolvedValue({ error: { message: 'not_found' } });
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(404);
  });

  it('maps a forbidden RPC error to 403', async () => {
    rpc.mockResolvedValue({ error: { message: 'forbidden' } });
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(403);
  });

  it('rejects an invalid payload before calling the RPC', async () => {
    const response = await PATCH(patchRequest({ ...resubmission, title: 'ab' }), params());
    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propagates an authorization failure', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });
    const response = await PATCH(patchRequest(), params());
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
