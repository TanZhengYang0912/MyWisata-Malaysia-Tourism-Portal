export interface BookingOutletReference {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
}

interface BookingOrderItemReference {
  vendor_id?: unknown;
  outlet_id?: unknown;
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === 'object' ? relation as Record<string, unknown> : null;
}

export function getBookingOrderItem(value: unknown): { vendorId: string | null; outletId: string | null } {
  const item = firstRelation(value) as BookingOrderItemReference | null;
  return {
    vendorId: typeof item?.vendor_id === 'string' ? item.vendor_id : null,
    outletId: typeof item?.outlet_id === 'string' ? item.outlet_id : null,
  };
}

export function selectBookingOutlet<T extends BookingOutletReference>(orderItemOutlet?: T | null, slotOutlet?: T | null): T | null {
  return orderItemOutlet?.id ? orderItemOutlet : slotOutlet?.id ? slotOutlet : null;
}
