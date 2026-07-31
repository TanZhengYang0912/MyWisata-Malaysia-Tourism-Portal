import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  emitVendorNotification: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/vendor-notifications/emit', () => ({ emitVendorNotification: mocks.emitVendorNotification }));

import { POST } from '../route';

const vendorId = 'vendor-1';
const bookingId = 'booking-1';
const assignedOutletId = 'order-outlet';
const conflictingSlotOutletId = 'slot-outlet';

function access() {
  return {
    ok: true,
    access: {
      userId: 'user-1',
      vendorId,
      role: 'vendor_owner',
      outletIds: [assignedOutletId],
      isOwner: true,
      isOutletManager: false,
      authDb: {},
      serviceDb: { from: mocks.from },
    },
  };
}

describe('POST vendor booking check-in outlet scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue(access());
    mocks.emitVendorNotification.mockResolvedValue({ notificationIds: [], recipientIds: [] });

    const bookingQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: bookingId,
          status: 'confirmed',
          order_item_id: 'order-item-1',
          order_items: [{ vendor_id: vendorId, outlet_id: assignedOutletId }],
          booking_slots: [{ outlet_id: conflictingSlotOutletId }],
        },
        error: null,
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    };
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.from.mockImplementation((table: string) => table === 'bookings' ? bookingQuery : updateQuery);
  });

  it('checks in a booking using the order-item outlet when the slot outlet is stale', async () => {
    const response = await POST(new Request('http://localhost'), { params: Promise.resolve({ vendorId, bookingId }) });

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('order_items');
    expect(mocks.emitVendorNotification).toHaveBeenCalledWith(expect.objectContaining({ outletId: assignedOutletId }));
  });
});
