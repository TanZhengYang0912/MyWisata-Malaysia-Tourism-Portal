import { describe, expect, it } from "vitest";

import {
  OUTLET_TIMELINE_SCENARIOS,
  buildVendorCustomerDemoPlan,
  stableUuid,
} from "../lib/vendor-customer-demo.mjs";

const customers = [
  { id: "aaaaaaaa-0000-0000-0000-000000000005", email: "customer1@demo.local", full_name: "Customer Alice" },
  { id: "aaaaaaaa-0000-0000-0000-000000000006", email: "customer2@demo.local", full_name: "Customer Bob" },
  { id: "aaaaaaaa-0000-0000-0000-000000000007", email: "customer3@demo.local", full_name: "Customer Charlie" },
  { id: "aaaaaaaa-0000-0000-0000-000000000008", email: "customer4@demo.local", full_name: "Customer Diana" },
];

const vendors = [
  { id: "10000000-0000-0000-0000-000000000001", owner_id: "20000000-0000-0000-0000-000000000001", name: "Heritage Trails", slug: "heritage-trails", status: "approved" },
  { id: "10000000-0000-0000-0000-000000000002", owner_id: "20000000-0000-0000-0000-000000000002", name: "Local Pantry", slug: "local-pantry", status: "approved" },
];

const outlets = [
  { id: "30000000-0000-0000-0000-000000000001", vendor_id: vendors[0].id, name: "Heritage Trails — Melaka", slug: "heritage-melaka", status: "active", review_status: "approved" },
  { id: "30000000-0000-0000-0000-000000000002", vendor_id: vendors[1].id, name: "Local Pantry — KLCC", slug: "pantry-klcc", status: "active", review_status: "approved" },
];

const products = [
  { id: "40000000-0000-0000-0000-000000000001", vendor_id: vendors[0].id, outlet_id: outlets[0].id, name: "Melaka Heritage Walk", requires_booking: true, base_price: 80, status: "active", review_status: "approved" },
  { id: "40000000-0000-0000-0000-000000000002", vendor_id: vendors[1].id, outlet_id: null, name: "Malaysian Snack Box", requires_booking: false, base_price: 45, status: "active", review_status: "approved" },
];

const baseInput = {
  vendors,
  outlets,
  products,
  outletOffers: [
    { id: "50000000-0000-0000-0000-000000000001", product_id: products[1].id, outlet_id: outlets[1].id, price: 49, status: "active" },
  ],
  customers,
  existingChatThreads: [],
  now: new Date("2026-09-05T02:00:00.000Z"),
};

describe("vendor customer demo planner", () => {
  it("creates a twelve-order customer timeline for every active outlet", () => {
    const plan = buildVendorCustomerDemoPlan(baseInput);
    const expectedTimelineOrderIds = new Set(
      outlets.flatMap((outlet) => OUTLET_TIMELINE_SCENARIOS.map((scenario) =>
        stableUuid(`vendor-customer-demo:${outlet.id}:${scenario.key}:order`),
      )),
    );
    const timelineOrders = plan.rows.orders.filter((order) => expectedTimelineOrderIds.has(String(order.id)));
    const timelineOrderIds = new Set(timelineOrders.map((order) => String(order.id)));

    for (const outlet of outlets) {
      const outletItems = plan.rows.orderItems.filter(
        (item) => item.outlet_id === outlet.id && timelineOrderIds.has(String(item.order_id)),
      );
      const outletOrders = outletItems.map((item) =>
        timelineOrders.find((order) => order.id === item.order_id),
      );

      expect(outletOrders).toHaveLength(12);
      expect(new Set(outletOrders.map((order) => order?.user_id))).toEqual(
        new Set(customers.map((customer) => customer.id)),
      );
      expect(outletOrders.map((order) => order?.status)).toEqual([
        "paid",
        "completed",
        "completed",
        "paid",
        "completed",
        "cancelled",
        "completed",
        "completed",
        "completed",
        "completed",
        "completed",
        "completed",
      ]);

      const agesInDays = outletOrders.map((order) =>
        Math.floor((baseInput.now.getTime() - new Date(String(order?.created_at ?? 0)).getTime()) / (24 * 60 * 60 * 1000)),
      );
      expect(agesInDays.filter((age) => age <= 0)).toHaveLength(1);
      expect(agesInDays.filter((age) => age <= 7)).toHaveLength(3);
      expect(agesInDays.filter((age) => age <= 30)).toHaveLength(6);
      expect(agesInDays.filter((age) => age > 30 && age <= 60)).toHaveLength(2);
      expect(agesInDays.filter((age) => age > 60 && age <= 365)).toHaveLength(4);
    }
  });

  it("creates varied, contextual reviews and natural visible activity labels", () => {
    const plan = buildVendorCustomerDemoPlan(baseInput);
    const reviews = plan.rows.reviews;

    expect(new Set(reviews.map((review) => String(review.body))).size).toBe(reviews.length);
    expect(new Set(reviews.map((review) => String(review.title))).size).toBeGreaterThan(2);
    expect(new Set(reviews.map((review) => Number(review.rating))).size).toBeGreaterThan(1);
    expect(reviews.every((review) => Number(review.rating) >= 1 && Number(review.rating) <= 5)).toBe(true);
    expect(reviews.every((review) => {
      const product = products.find((candidate) => candidate.id === review.product_id);
      const outlet = outlets.find((candidate) => candidate.id === review.outlet_id);
      const body = String(review.body);
      return product?.name && outlet?.name && body.includes(product.name) && body.includes(outlet.name);
    })).toBe(true);
    expect(plan.rows.orders.every((order) => !String(order.notes ?? "").startsWith("Demo"))).toBe(true);
    expect(plan.rows.vouchers.every((voucher) => !String(voucher.name ?? "").startsWith("Demo"))).toBe(true);
    expect(plan.rows.bookings.every((booking) => !String(booking.demo_qr_code ?? "").startsWith("DEMO"))).toBe(true);
  });

  it("builds a deterministic processed refund tied to Alice's own order and payment", () => {
    const first = buildVendorCustomerDemoPlan(baseInput);
    const second = buildVendorCustomerDemoPlan(baseInput);
    const refund = first.rows.refunds[0];
    const order = first.rows.orders.find((row) => row.id === refund?.order_id);
    const payment = first.rows.payments.find((row) => row.id === refund?.payment_id);
    const item = first.rows.orderItems.find((row) => row.order_id === order?.id);

    expect(first.issues).toEqual([]);
    expect(first.rows.refunds).toHaveLength(1);
    expect(refund).toMatchObject({
      amount: order?.total_amount,
      status: "processed",
      processed_by: "aaaaaaaa-0000-0000-0000-000000000001",
    });
    expect(order).toMatchObject({
      user_id: customers[0].id,
      status: "refunded",
      payment_method: "mock_card",
    });
    expect(payment).toMatchObject({
      order_id: order?.id,
      status: "refunded",
      method: "mock_card",
    });
    expect(item).toMatchObject({ order_id: order?.id, fulfil_status: "cancelled" });
    expect(second.rows.refunds).toEqual(first.rows.refunds);
  });

  it("builds coherent purchases from direct products and same-vendor outlet offers", () => {
    const plan = buildVendorCustomerDemoPlan(baseInput);

    expect(plan.issues).toEqual([]);
    expect(plan.rows.orders).toHaveLength(25);
    expect(plan.rows.orderItems).toHaveLength(25);
    expect(plan.rows.bookingSlots).toHaveLength(11);
    expect(plan.rows.bookings).toHaveLength(11);
    expect(plan.rows.reviews).toHaveLength(8);
    expect(plan.rows.chatThreads).toHaveLength(2);
    expect(plan.rows.vouchers).toHaveLength(2);
    expect(plan.rows.voucherRedemptions).toHaveLength(10);

    const offeredItem = plan.rows.orderItems.find((item) => item.outlet_id === outlets[1].id);
    expect(offeredItem).toMatchObject({
      vendor_id: vendors[1].id,
      product_id: products[1].id,
      unit_price: 49,
    });

    for (const item of plan.rows.orderItems) {
      const outlet = outlets.find((candidate) => candidate.id === item.outlet_id);
      const product = products.find((candidate) => candidate.id === item.product_id);
      expect(item.vendor_id).toBe(outlet?.vendor_id);
      expect(item.vendor_id).toBe(product?.vendor_id);
    }
  });

  it("never creates bookings for a non-bookable product", () => {
    const plan = buildVendorCustomerDemoPlan(baseInput);
    const offeredItemIds = new Set(
      plan.rows.orderItems
        .filter((item) => item.product_id === products[1].id)
        .map((item) => item.id),
    );

    expect(plan.rows.bookings.some(
      (booking) => Boolean(booking.order_item_id && offeredItemIds.has(booking.order_item_id)),
    )).toBe(false);
    expect(plan.rows.orderItems.find((item) => offeredItemIds.has(item.id))?.slot_id).toBeNull();
  });

  it("keeps an offered-only bookable product relationally valid without inventing an outlet slot", () => {
    const offeredBookableProduct = { ...products[1], requires_booking: true };
    const plan = buildVendorCustomerDemoPlan({
      ...baseInput,
      vendors: [vendors[1]],
      outlets: [outlets[1]],
      products: [offeredBookableProduct],
      outletOffers: [
        { ...baseInput.outletOffers[0], product_id: offeredBookableProduct.id },
      ],
    });

    expect(plan.issues).toEqual([]);
    expect(plan.rows.orders).toHaveLength(13);
    expect(plan.rows.orderItems).toHaveLength(13);
    expect(plan.rows.bookingSlots).toHaveLength(0);
    expect(plan.rows.bookings).toHaveLength(0);
    expect(plan.rows.orderItems.every((item) => item.slot_id === null)).toBe(true);
    expect(plan.rows.orders.filter((order) => order.status === "completed")).toHaveLength(9);
    expect(plan.rows.orders.filter((order) => order.status === "cancelled")).toHaveLength(3);
    expect(plan.rows.orders.filter((order) => order.status === "refunded")).toHaveLength(1);
    expect(plan.rows.orders
      .filter((order) => order.status === "cancelled")
      .every((order) => new Date(String(order.cancelled_at)).getTime() <= baseInput.now.getTime()))
      .toBe(true);
  });

  it("rejects a cross-vendor outlet offer instead of fabricating an invalid order", () => {
    const invalidInput = {
      ...baseInput,
      products: [products[0]],
      outletOffers: [
        { id: "50000000-0000-0000-0000-000000000009", product_id: products[0].id, outlet_id: outlets[1].id, price: 50, status: "active" },
      ],
    };

    const plan = buildVendorCustomerDemoPlan(invalidInput);

    expect(plan.rows.orderItems.some((item) => item.outlet_id === outlets[1].id)).toBe(false);
    expect(plan.issues).toContainEqual({
      code: "outlet_without_eligible_product",
      vendorId: vendors[1].id,
      outletId: outlets[1].id,
      outletName: outlets[1].name,
    });
  });

  it("uses stable IDs and preserves an existing outlet conversation", () => {
    const existingChatThreads = [
      { id: "60000000-0000-0000-0000-000000000001", customer_id: customers[0].id, outlet_id: outlets[0].id, vendor_id: vendors[0].id },
    ];
    const first = buildVendorCustomerDemoPlan({ ...baseInput, existingChatThreads });
    const second = buildVendorCustomerDemoPlan({ ...baseInput, existingChatThreads });

    expect(first).toEqual(second);
    expect(first.rows.chatThreads).toHaveLength(1);
    expect(first.rows.chatThreads[0].outlet_id).toBe(outlets[1].id);
    expect(stableUuid("vendor-customer-demo:order:example")).toBe(stableUuid("vendor-customer-demo:order:example"));
  });

  it("uses only independently phone-verified customers for commerce", () => {
    const plan = buildVendorCustomerDemoPlan({
      ...baseInput,
      commerceCustomers: [customers[0]],
    });

    expect(new Set(plan.rows.orders.map((order) => order.user_id))).toEqual(new Set([customers[0].id]));
    expect(new Set(plan.rows.bookings.map((booking) => booking.customer_id))).toEqual(new Set([customers[0].id]));
  });

  it("deduplicates wishlists by the database user-product key", () => {
    const secondOutlet = {
      ...outlets[0],
      id: "30000000-0000-0000-0000-000000000009",
      name: "Heritage Trails — Riverside",
      slug: "heritage-riverside",
    };
    const plan = buildVendorCustomerDemoPlan({
      ...baseInput,
      vendors: [vendors[0]],
      outlets: [outlets[0], secondOutlet],
      products: [products[0]],
      outletOffers: [
        {
          id: "50000000-0000-0000-0000-000000000009",
          product_id: products[0].id,
          outlet_id: secondOutlet.id,
          price: 85,
          status: "active",
        },
      ],
      customers: [customers[0]],
      commerceCustomers: [customers[0]],
    });

    expect(plan.rows.wishlists).toHaveLength(1);
    expect(plan.rows.wishlists[0]).toMatchObject({
      user_id: customers[0].id,
      product_id: products[0].id,
    });
  });

  it("prefers a direct bookable product over an offered-only bookable product", () => {
    const directBookableProduct = { ...products[0], name: "Z Direct Heritage Tour" };
    const offeredBookableProduct = {
      ...products[0],
      id: "40000000-0000-0000-0000-000000000009",
      outlet_id: null,
      name: "A Partner Heritage Tour",
    };
    const plan = buildVendorCustomerDemoPlan({
      ...baseInput,
      vendors: [vendors[0]],
      outlets: [outlets[0]],
      products: [offeredBookableProduct, directBookableProduct],
      outletOffers: [
        {
          id: "50000000-0000-0000-0000-000000000010",
          product_id: offeredBookableProduct.id,
          outlet_id: outlets[0].id,
          price: 75,
          status: "active",
        },
      ],
    });

    expect(plan.rows.orderItems).toHaveLength(13);
    expect(plan.rows.orderItems.every((item) => item.product_id === directBookableProduct.id)).toBe(true);
    expect(plan.rows.bookings).toHaveLength(11);
  });
});
