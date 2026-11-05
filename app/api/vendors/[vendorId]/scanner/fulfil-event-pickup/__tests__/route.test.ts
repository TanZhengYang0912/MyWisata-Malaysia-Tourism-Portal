import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signEventPickupToken } from '@/lib/events/event-pickup-token';

const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_VENDOR_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '33333333-3333-4333-8333-333333333333';
const PICKUP_SLOT_ID = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from '../route';

function request(eventToken: string) {
  return new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/fulfil-event-pickup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventToken }),
  });
}

const params = { params: Promise.resolve({ vendorId: VENDOR_ID }) };
const futureDate = '2099-12-31';

describe('POST fulfil-event-pickup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: 'operator-1', serviceDb: { rpc: mocks.rpc } } });
    mocks.rpc.mockResolvedValue({ data: { orderId: ORDER_ID, status: 'fulfilled', items: 1 }, error: null });
  });

  it('lets event vendors in and records the pickup with the claims from the signed code', async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, pickupSlotId: PICKUP_SLOT_ID, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, undefined, { allowEventVendor: true, requireApproved: true });
    expect(mocks.rpc).toHaveBeenCalledWith('fulfil_event_pickup', {
      p_order_id: ORDER_ID, p_vendor_id: VENDOR_ID, p_location_id: LOCATION_ID, p_pickup_date: futureDate, p_operator_id: 'operator-1', p_pickup_slot_id: PICKUP_SLOT_ID,
    });
  });

  it('passes an explicit null slot for a legacy date-only QR', async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('fulfil_event_pickup', expect.objectContaining({ p_pickup_slot_id: null }));
  });

  it("refuses another vendor's pickup code", async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: OTHER_VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a code whose pickup date has passed', async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: '2020-01-01', issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'EVENT_PICKUP_EXPIRED' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reports a pickup scanned before its date', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'event_pickup_wrong_date' } });
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'EVENT_PICKUP_WRONG_DATE' } });
  });

  it('maps the atomic database time gate to an early-pickup validation error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'event_pickup_not_yet' } });
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, pickupSlotId: PICKUP_SLOT_ID, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'EVENT_PICKUP_NOT_YET' } });
  });

  it('rejects a forged code', async () => {
    const response = await POST(request('evt1.e30.AAAA'), params);
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
