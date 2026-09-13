export interface DemoCustomer {
  id: string;
  email?: string;
  full_name?: string;
}

export interface DemoVendor {
  id: string;
  owner_id?: string | null;
  name: string;
  slug: string;
  status: string;
}

export interface DemoOutlet {
  id: string;
  vendor_id: string;
  name: string;
  slug: string;
  status: string;
  review_status?: string | null;
}

export interface DemoProduct {
  id: string;
  vendor_id: string;
  outlet_id?: string | null;
  name: string;
  requires_booking: boolean;
  base_price: number;
  status: string;
  review_status?: string | null;
}

export interface DemoOutletOffer {
  id: string;
  product_id: string;
  outlet_id: string;
  price?: number | null;
  status: string;
}

export interface DemoChatThread {
  id: string;
  customer_id: string;
  outlet_id: string;
  vendor_id: string;
}

export interface DemoRow {
  id: string;
  order_item_id?: string;
  outlet_id?: string;
  product_id?: string;
  slot_id?: string | null;
  status?: string;
  user_id?: string;
  customer_id?: string;
  vendor_id?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface VendorCustomerDemoPlan {
  rows: {
    vouchers: DemoRow[];
    orders: DemoRow[];
    orderItems: DemoRow[];
    payments: DemoRow[];
    refunds: DemoRow[];
    bookingSlots: DemoRow[];
    bookings: DemoRow[];
    reviews: DemoRow[];
    voucherRedemptions: DemoRow[];
    interactions: DemoRow[];
    wishlists: DemoRow[];
    chatThreads: DemoRow[];
    chatMessages: DemoRow[];
  };
  issues: Array<Record<string, string>>;
  stats: {
    vendors: number;
    outlets: number;
    coveredOutlets: number;
  };
}

export function stableUuid(value: string): string;

export const OUTLET_TIMELINE_SCENARIOS: ReadonlyArray<{
  key: string;
  dayOffset: number;
  status: string;
  fulfilStatus: string;
  quantity: number;
  review: boolean;
  useVoucher: boolean;
}>;

export function buildVendorCustomerDemoPlan(input: {
  vendors: DemoVendor[];
  outlets: DemoOutlet[];
  products: DemoProduct[];
  outletOffers: DemoOutletOffer[];
  customers: DemoCustomer[];
  commerceCustomers?: DemoCustomer[];
  existingChatThreads?: DemoChatThread[];
  now?: Date;
}): VendorCustomerDemoPlan;
