import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signEventPickupToken } from '@/lib/events/event-pickup-token';

const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_VENDOR_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '33333333-3333-4333-8333-333333333333';
const PICKUP_SLOT_ID = '66666666-6666-4666-8666-666666666666';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from '../route';

function request(eventToken: string, eventLocationId: string = LOCATION_ID, pickupDate: string = futureDate) {
  return new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/fulfil-event-pickup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventToken, eventLocationId, pickupDate }),
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
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, undefined, { allowEventVendor: true, requireApproved: true, allowEventStaff: true });
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

  it("requires the fulfilment context to match the signed location and date", async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    const missingContext = await POST(new Request(`http://localhost/api/vendors/${VENDOR_ID}/scanner/fulfil-event-pickup`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventToken: token }),
    }), params);
    expect(missingContext.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();

    const mismatch = await POST(request(token, '77777777-7777-4777-8777-777777777777', futureDate), params);
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({ error: { code: 'EVENT_CONTEXT_MISMATCH' } });

    const wrongDate = await POST(request(token, LOCATION_ID, '2020-01-01'), params);
    expect(wrongDate.status).toBe(409);
    await expect(wrongDate.json()).resolves.toMatchObject({ error: { code: 'EVENT_CONTEXT_MISMATCH' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses another vendor's pickup code", async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: OTHER_VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    const response = await POST(request(token), params);

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a code whose pickup date has passed', async () => {
    const token = signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: '2020-01-01', issuedAt: 1 });

    const response = await POST(request(token, LOCATION_ID, '2020-01-01'), params);

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

  describe('event staff', () => {
    const STAFF_CAMPAIGN = '77777777-7777-4777-8777-777777777777';
    const token = () => signEventPickupToken({ orderId: ORDER_ID, vendorId: VENDOR_ID, locationId: LOCATION_ID, pickupDate: futureDate, issuedAt: 1 });

    function asStaff(locationCampaignId: string) {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(async () => ({ data: { campaign_id: locationCampaignId }, error: null }));
      mocks.from.mockReturnValue(builder);
      mocks.authorizeVendor.mockResolvedValue({
        ok: true,
        access: { userId: 'staff-1', role: 'event_staff', eventCampaignIds: [STAFF_CAMPAIGN], serviceDb: { rpc: mocks.rpc, from: mocks.from } },
      });
    }

    it('records a collection by staff at a location of their event as that staff member', async () => {
      asStaff(STAFF_CAMPAIGN);

      const response = await POST(request(token()), params);

      expect(response.status).toBe(200);
      expect(mocks.from).toHaveBeenCalledWith('promotion_campaign_locations');
      expect(mocks.rpc).toHaveBeenCalledWith('fulfil_event_pickup', expect.objectContaining({ p_operator_id: 'staff-1', p_location_id: LOCATION_ID }));
    });

    it('rejects staff at a location outside their event without calling the RPC', async () => {
      asStaff('88888888-8888-4888-8888-888888888888');

      const response = await POST(request(token()), params);

      expect(response.status).toBe(403);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
});
