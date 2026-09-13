import crypto from "node:crypto";
import {
  buildDemoBookingReference,
  buildDemoOrderNote,
  buildDemoReviewCopy,
  buildDemoVoucherCopy,
} from "./demo-content.mjs";

const DEMO_PREFIX = "vendor-customer-demo";
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const ALICE_ID = "aaaaaaaa-0000-0000-0000-000000000005";

export const OUTLET_TIMELINE_SCENARIOS = Object.freeze([
  { key: "upcoming", dayOffset: 0, status: "paid", fulfilStatus: "pending", quantity: 1, review: false, useVoucher: false },
  { key: "completed", dayOffset: -2, status: "completed", fulfilStatus: "fulfilled", quantity: 2, review: true, useVoucher: true },
  { key: "recent-completed", dayOffset: -5, status: "completed", fulfilStatus: "fulfilled", quantity: 1, review: false, useVoucher: false },
  { key: "month-paid", dayOffset: -10, status: "paid", fulfilStatus: "ready", quantity: 2, review: false, useVoucher: false },
  { key: "month-completed", dayOffset: -18, status: "completed", fulfilStatus: "fulfilled", quantity: 1, review: true, useVoucher: true },
  { key: "month-cancelled", dayOffset: -27, status: "cancelled", fulfilStatus: "cancelled", quantity: 1, review: false, useVoucher: false },
  { key: "previous-completed-a", dayOffset: -36, status: "completed", fulfilStatus: "fulfilled", quantity: 2, review: false, useVoucher: true },
  { key: "previous-completed-b", dayOffset: -52, status: "completed", fulfilStatus: "fulfilled", quantity: 1, review: false, useVoucher: false },
  { key: "annual-completed-a", dayOffset: -90, status: "completed", fulfilStatus: "fulfilled", quantity: 2, review: true, useVoucher: true },
  { key: "annual-completed-b", dayOffset: -150, status: "completed", fulfilStatus: "fulfilled", quantity: 1, review: false, useVoucher: false },
  { key: "annual-completed-c", dayOffset: -240, status: "completed", fulfilStatus: "fulfilled", quantity: 2, review: true, useVoucher: true },
  { key: "annual-completed-d", dayOffset: -330, status: "completed", fulfilStatus: "fulfilled", quantity: 1, review: false, useVoucher: false },
]);

export function stableUuid(value) {
  const hex = crypto.createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function iso(date) {
  return date.toISOString();
}

function dateFrom(now, dayOffset, hour = 10) {
  const date = new Date(now.getTime() + dayOffset * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function malaysiaTimelineDate(now, dayOffset, hour = 10) {
  const malaysiaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const malaysiaDayStart = Date.UTC(
    malaysiaNow.getUTCFullYear(),
    malaysiaNow.getUTCMonth(),
    malaysiaNow.getUTCDate() + dayOffset,
  ) - 8 * 60 * 60 * 1000;
  const preferred = new Date(malaysiaDayStart + hour * 60 * 60 * 1000);

  if (dayOffset !== 0 || preferred <= now) return preferred;
  return new Date(Math.max(malaysiaDayStart, now.getTime() - 30 * 60 * 1000));
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function activeApproved(row) {
  return row.status === "active" && (!row.review_status || row.review_status === "approved");
}

function productAvailableAtOutlet(product, outlet, offersByOutlet) {
  if (product.vendor_id !== outlet.vendor_id || !activeApproved(product)) return null;
  if (product.outlet_id === outlet.id) {
    return { product, price: money(product.base_price), direct: true };
  }

  const offer = (offersByOutlet.get(outlet.id) ?? []).find(
    (candidate) => candidate.product_id === product.id && candidate.status === "active",
  );
  if (!offer) return null;
  return { product, price: money(offer.price ?? product.base_price), direct: false };
}

function emptyRows() {
  return {
    vouchers: [],
    orders: [],
    orderItems: [],
    payments: [],
    refunds: [],
    bookingSlots: [],
    bookings: [],
    reviews: [],
    voucherRedemptions: [],
    interactions: [],
    wishlists: [],
    chatThreads: [],
    chatMessages: [],
  };
}

function addAliceRefund(rows, commerceCustomers, now, issues) {
  const alice = commerceCustomers.find((customer) => customer.id === ALICE_ID);
  const sourceItem = rows.orderItems[0];
  if (!alice || !sourceItem) {
    issues.push({ code: "alice_refund_source_missing", customerId: ALICE_ID });
    return;
  }

  const key = `${DEMO_PREFIX}:alice:external-refund`;
  const createdAt = dateFrom(now, -6, 13);
  const processedAt = dateFrom(now, -5, 15);
  const amount = money(sourceItem.unit_price);
  const orderId = stableUuid(`${key}:order`);
  const paymentId = stableUuid(`${key}:payment`);

  rows.orders.push({
    id: orderId,
    user_id: alice.id,
    status: "refunded",
    subtotal: amount,
    discount_amount: 0,
    total_amount: amount,
    currency: "MYR",
    payment_method: "mock_card",
    voucher_code: null,
    notes: "Refund issued after an itinerary change",
    paid_at: iso(new Date(createdAt.getTime() + 30 * 60 * 1000)),
    completed_at: null,
    cancelled_at: null,
    created_at: iso(createdAt),
    updated_at: iso(processedAt),
  });
  rows.orderItems.push({
    id: stableUuid(`${key}:order-item`),
    order_id: orderId,
    vendor_id: sourceItem.vendor_id,
    outlet_id: sourceItem.outlet_id,
    product_id: sourceItem.product_id,
    variant_id: null,
    slot_id: null,
    product_name: sourceItem.product_name,
    variant_name: null,
    slot_starts_at: null,
    unit_price: amount,
    quantity: 1,
    line_total: amount,
    fulfil_status: "cancelled",
    fulfilled_at: null,
    created_at: iso(createdAt),
  });
  rows.payments.push({
    id: paymentId,
    order_id: orderId,
    method: "mock_card",
    provider: "demo",
    amount,
    status: "refunded",
    gateway_ref: `DEMO-${stableUuid(key).replaceAll("-", "").slice(0, 16).toUpperCase()}`,
    processed_at: iso(new Date(createdAt.getTime() + 30 * 60 * 1000)),
    created_at: iso(createdAt),
    updated_at: iso(processedAt),
  });
  rows.refunds.push({
    id: stableUuid(key),
    payment_id: paymentId,
    order_id: orderId,
    amount,
    reason: "Customer changed the itinerary before the visit",
    status: "processed",
    processed_by: ADMIN_ID,
    processed_at: iso(processedAt),
    created_at: iso(processedAt),
  });
}

function addPurchase(rows, { vendor, outlet, product, unitPrice, directProduct, customer, scenario, outletIndex, scenarioIndex, voucher, now }) {
  const offeredBookableWithoutSlot = Boolean(product.requires_booking && !directProduct);
  const effectiveStatus = offeredBookableWithoutSlot && scenario.status === "paid"
    ? "cancelled"
    : scenario.status;
  const completed = effectiveStatus === "completed";
  const cancelled = effectiveStatus === "cancelled";
  const booking = Boolean(product.requires_booking && directProduct && !cancelled);
  const createdAt = malaysiaTimelineDate(now, scenario.dayOffset, 10 + ((outletIndex + scenarioIndex) % 6));
  const slotStart = completed
    ? new Date(createdAt.getTime() + 4 * 60 * 60 * 1000)
    : dateFrom(now, 3 + ((outletIndex + scenarioIndex) % 14), 10 + (outletIndex % 5));
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const completedAt = completed ? new Date(slotEnd.getTime() + 30 * 60 * 1000) : null;
  const paidAt = new Date(Math.min(createdAt.getTime() + 30 * 60 * 1000, now.getTime()));
  const cancelledAt = cancelled
    ? new Date(Math.min(createdAt.getTime() + 60 * 60 * 1000, now.getTime()))
    : null;
  const quantity = scenario.key === "completed" ? 1 + (outletIndex % 2) : scenario.quantity;
  const subtotal = money(unitPrice * quantity);
  const discount = scenario.useVoucher && completed ? money(subtotal * 0.1) : 0;
  const total = money(subtotal - discount);
  const key = `${DEMO_PREFIX}:${outlet.id}:${scenario.key}`;
  const orderId = stableUuid(`${key}:order`);
  const itemId = stableUuid(`${key}:order-item`);
  const slotId = booking ? stableUuid(`${key}:slot`) : null;

  rows.orders.push({
    id: orderId,
    user_id: customer.id,
    status: effectiveStatus,
    subtotal,
    discount_amount: discount,
    total_amount: total,
    currency: "MYR",
    payment_method: "mock_card",
    voucher_code: discount > 0 ? voucher.code : null,
    notes: buildDemoOrderNote({ product, outlet, scenarioKey: scenario.key }),
    paid_at: cancelled ? null : iso(paidAt),
    completed_at: completedAt ? iso(completedAt) : null,
    cancelled_at: cancelledAt ? iso(cancelledAt) : null,
    created_at: iso(createdAt),
    updated_at: cancelled
      ? iso(cancelledAt)
      : iso(completedAt ?? createdAt),
  });

  rows.orderItems.push({
    id: itemId,
    order_id: orderId,
    vendor_id: vendor.id,
    outlet_id: outlet.id,
    product_id: product.id,
    variant_id: null,
    slot_id: slotId,
    product_name: product.name,
    variant_name: null,
    slot_starts_at: booking ? iso(slotStart) : null,
    unit_price: unitPrice,
    quantity,
    line_total: subtotal,
    fulfil_status: cancelled ? "cancelled" : scenario.fulfilStatus,
    fulfilled_at: completedAt ? iso(completedAt) : null,
    created_at: iso(createdAt),
  });

  rows.payments.push({
    id: stableUuid(`${key}:payment`),
    order_id: orderId,
    method: "mock_card",
    provider: "demo",
    amount: total,
    status: cancelled ? "cancelled" : "succeeded",
    gateway_ref: `DEMO-${stableUuid(key).replaceAll("-", "").slice(0, 16).toUpperCase()}`,
    processed_at: iso(paidAt),
    created_at: iso(createdAt),
    updated_at: iso(createdAt),
  });

  if (booking) {
    rows.bookingSlots.push({
      id: slotId,
      product_id: product.id,
      outlet_id: outlet.id,
      starts_at: iso(slotStart),
      ends_at: iso(slotEnd),
      capacity: 12,
      booked: quantity,
      status: completed ? "expired" : "available",
      created_at: iso(createdAt),
    });
    rows.bookings.push({
      id: stableUuid(`${key}:booking`),
      order_item_id: itemId,
      slot_id: slotId,
      customer_id: customer.id,
      status: completed ? "checked_in" : "confirmed",
      demo_qr_code: buildDemoBookingReference(itemId),
      check_in_at: completedAt ? iso(slotStart) : null,
      cancelled_at: null,
      created_at: iso(createdAt),
    });
  }

  rows.interactions.push({
    id: stableUuid(`${key}:interaction:view`),
    user_id: customer.id,
    event_type: "view",
    entity_type: "product",
    entity_id: product.id,
    dwell_ms: 20_000 + ((outletIndex + scenarioIndex) % 8) * 4_000,
    created_at: iso(new Date(createdAt.getTime() - DAY_MS)),
  });

  if (!completed) return;

  if (scenario.review) {
    const reviewCopy = buildDemoReviewCopy({
      product,
      outlet,
      reviewIndex: scenarioIndex,
      scenarioKey: scenario.key,
    });
    rows.reviews.push({
      id: stableUuid(`${key}:review`),
      user_id: customer.id,
      order_item_id: itemId,
      vendor_id: vendor.id,
      outlet_id: outlet.id,
      product_id: product.id,
      rating: reviewCopy.rating,
      title: reviewCopy.title,
      body: reviewCopy.body,
      is_visible: true,
      created_at: iso(new Date(completedAt.getTime() + DAY_MS)),
    });
  }
  if (discount > 0) {
    rows.voucherRedemptions.push({
      id: stableUuid(`${key}:voucher-redemption`),
      voucher_id: voucher.id,
      order_id: orderId,
      user_id: customer.id,
      discount,
      created_at: iso(createdAt),
    });
  }
  rows.wishlists.push({
    id: stableUuid(`${key}:wishlist`),
    user_id: customer.id,
    product_id: product.id,
    created_at: iso(new Date(createdAt.getTime() - 2 * DAY_MS)),
  });
}

export function buildVendorCustomerDemoPlan({
  vendors,
  outlets,
  products,
  outletOffers,
  customers,
  commerceCustomers = customers,
  existingChatThreads = [],
  now = new Date(),
}) {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error("At least one existing demo customer is required.");
  }
  if (!Array.isArray(commerceCustomers) || commerceCustomers.length === 0) {
    throw new Error("At least one phone-verified demo customer is required for commerce.");
  }

  const rows = emptyRows();
  const issues = [];
  const approvedVendors = vendors
    .filter((vendor) => vendor.status === "approved")
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const vendorById = new Map(approvedVendors.map((vendor) => [vendor.id, vendor]));
  const offersByOutlet = new Map();
  for (const offer of outletOffers) {
    const current = offersByOutlet.get(offer.outlet_id) ?? [];
    current.push(offer);
    offersByOutlet.set(offer.outlet_id, current);
  }

  const voucherByVendor = new Map();
  for (const vendor of approvedVendors) {
    if (!vendor.owner_id) {
      issues.push({ code: "vendor_without_owner", vendorId: vendor.id, vendorName: vendor.name });
      continue;
    }
    const voucherCopy = buildDemoVoucherCopy(vendor.id);
    const voucher = {
      id: stableUuid(`${DEMO_PREFIX}:${vendor.id}:voucher`),
      vendor_id: vendor.id,
      outlet_id: null,
      code: voucherCopy.code,
      name: voucherCopy.name,
      voucher_type: "percent",
      discount_value: 10,
      min_spend: 0,
      max_uses: 500,
      uses_count: 0,
      valid_from: iso(dateFrom(now, -30, 0)),
      valid_until: iso(dateFrom(now, 180, 23)),
      is_active: true,
      review_status: "approved",
      created_at: iso(dateFrom(now, -30, 0)),
    };
    rows.vouchers.push(voucher);
    voucherByVendor.set(vendor.id, voucher);
  }

  const activeOutlets = outlets
    .filter((outlet) => activeApproved(outlet) && vendorById.has(outlet.vendor_id))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const productRows = products.slice().sort((left, right) => left.name.localeCompare(right.name));
  const outletsWithChat = new Set(existingChatThreads.map((thread) => thread.outlet_id));

  activeOutlets.forEach((outlet, outletIndex) => {
    const vendor = vendorById.get(outlet.vendor_id);
    const voucher = voucherByVendor.get(outlet.vendor_id);
    if (!vendor || !voucher) return;

    const eligibleProducts = productRows
      .map((product) => productAvailableAtOutlet(product, outlet, offersByOutlet))
      .filter(Boolean)
      .sort((left, right) => {
        const score = (candidate) => {
          if (candidate.direct && candidate.product.requires_booking) return 0;
          if (candidate.direct) return 1;
          if (!candidate.product.requires_booking) return 2;
          return 3;
        };
        const scoreDifference = score(left) - score(right);
        return scoreDifference || left.product.name.localeCompare(right.product.name);
      });
    if (eligibleProducts.length === 0) {
      issues.push({
        code: "outlet_without_eligible_product",
        vendorId: outlet.vendor_id,
        outletId: outlet.id,
        outletName: outlet.name,
      });
      return;
    }

    const purchasePool = eligibleProducts.some(
      (candidate) => candidate.direct || !candidate.product.requires_booking,
    )
      ? eligibleProducts.filter((candidate) => candidate.direct || !candidate.product.requires_booking)
      : eligibleProducts;

    OUTLET_TIMELINE_SCENARIOS.forEach((scenario, scenarioIndex) => {
      const eligible = ["completed", "upcoming"].includes(scenario.key)
        ? eligibleProducts[0]
        : purchasePool[(outletIndex + scenarioIndex) % purchasePool.length];
      addPurchase(rows, {
        vendor,
        outlet,
        product: eligible.product,
        unitPrice: eligible.price,
        directProduct: eligible.direct,
        customer: commerceCustomers[(outletIndex + scenarioIndex) % commerceCustomers.length],
        scenario,
        outletIndex,
        scenarioIndex,
        voucher,
        now,
      });
    });

    if (!outletsWithChat.has(outlet.id)) {
      const chatCustomer = customers[(outletIndex + 2) % customers.length];
      const threadKey = `${DEMO_PREFIX}:${outlet.id}:chat`;
      const threadId = stableUuid(`${threadKey}:thread`);
      const createdAt = dateFrom(now, -4 - (outletIndex % 18), 11);
      const repliedAt = new Date(createdAt.getTime() + 35 * 60 * 1000);
      rows.chatThreads.push({
        id: threadId,
        customer_id: chatCustomer.id,
        outlet_id: outlet.id,
        vendor_id: vendor.id,
        status: "open",
        last_message_at: iso(repliedAt),
        created_at: iso(createdAt),
      });
      rows.chatMessages.push(
        {
          id: stableUuid(`${threadKey}:message:customer`),
          thread_id: threadId,
          sender_id: chatCustomer.id,
          body: `Hi, is ${purchasePool[0].product.name} available when I visit ${outlet.name}?`,
          context_product_id: purchasePool[0].product.id,
          created_at: iso(createdAt),
        },
        {
          id: stableUuid(`${threadKey}:message:vendor`),
          thread_id: threadId,
          sender_id: vendor.owner_id,
          body: `Yes, our team at ${outlet.name} can help you plan the visit. Please share your preferred date.`,
          context_product_id: purchasePool[0].product.id,
          created_at: iso(repliedAt),
        },
      );
    }
  });

  addAliceRefund(rows, commerceCustomers, now, issues);

  const wishlistKeys = new Set();
  rows.wishlists = rows.wishlists.filter((wishlist) => {
    const key = `${wishlist.user_id}:${wishlist.product_id}`;
    if (wishlistKeys.has(key)) return false;
    wishlistKeys.add(key);
    return true;
  });

  const redemptionCount = new Map();
  for (const redemption of rows.voucherRedemptions) {
    redemptionCount.set(redemption.voucher_id, (redemptionCount.get(redemption.voucher_id) ?? 0) + 1);
  }
  for (const voucher of rows.vouchers) voucher.uses_count = redemptionCount.get(voucher.id) ?? 0;

  return {
    rows,
    issues,
    stats: {
      vendors: approvedVendors.length,
      outlets: activeOutlets.length,
      coveredOutlets: new Set(rows.orderItems.map((item) => item.outlet_id)).size,
      timelineOrders: activeOutlets.length * OUTLET_TIMELINE_SCENARIOS.length,
      commerceCustomers: new Set(
        rows.orders
          .filter((order) => activeOutlets.some((outlet) =>
            OUTLET_TIMELINE_SCENARIOS.some((scenario) =>
              order.id === stableUuid(`${DEMO_PREFIX}:${outlet.id}:${scenario.key}:order`),
            ),
          ))
          .map((order) => order.user_id),
      ).size,
    },
  };
}
