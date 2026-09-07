import crypto from "node:crypto";

const DEMO_PREFIX = "vendor-customer-demo";
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const ALICE_ID = "aaaaaaaa-0000-0000-0000-000000000005";

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
    notes: "Demo purchase refunded after an itinerary change",
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
    reason: "Demo customer refund after an itinerary change",
    status: "processed",
    processed_by: ADMIN_ID,
    processed_at: iso(processedAt),
    created_at: iso(processedAt),
  });
}

function addPurchase(rows, { vendor, outlet, product, unitPrice, directProduct, customer, scenario, outletIndex, voucher, now }) {
  const booking = Boolean(product.requires_booking && directProduct);
  const completed = scenario === "completed";
  const cancelled = !completed && product.requires_booking && !directProduct;
  const createdAt = completed ? dateFrom(now, -28 - (outletIndex % 21), 8) : dateFrom(now, -2, 9);
  const slotStart = completed ? dateFrom(createdAt, 7, 10) : dateFrom(now, 3 + (outletIndex % 14), 10 + (outletIndex % 5));
  const slotEnd = new Date(slotStart.getTime() + 2 * 60 * 60 * 1000);
  const completedAt = completed ? new Date(slotEnd.getTime() + 30 * 60 * 1000) : null;
  const quantity = completed ? 1 + (outletIndex % 2) : 1;
  const subtotal = money(unitPrice * quantity);
  const discount = completed ? money(subtotal * 0.1) : 0;
  const total = money(subtotal - discount);
  const key = `${DEMO_PREFIX}:${outlet.id}:${scenario}`;
  const orderId = stableUuid(`${key}:order`);
  const itemId = stableUuid(`${key}:order-item`);
  const slotId = booking ? stableUuid(`${key}:slot`) : null;

  rows.orders.push({
    id: orderId,
    user_id: customer.id,
    status: completed ? "completed" : cancelled ? "cancelled" : "paid",
    subtotal,
    discount_amount: discount,
    total_amount: total,
    currency: "MYR",
    payment_method: "mock_card",
    voucher_code: completed ? voucher.code : null,
    notes: `Demo purchase at ${outlet.name}`,
    paid_at: cancelled ? null : iso(new Date(createdAt.getTime() + 30 * 60 * 1000)),
    completed_at: completedAt ? iso(completedAt) : null,
    cancelled_at: cancelled ? iso(new Date(createdAt.getTime() + 60 * 60 * 1000)) : null,
    created_at: iso(createdAt),
    updated_at: cancelled
      ? iso(new Date(createdAt.getTime() + 60 * 60 * 1000))
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
    fulfil_status: completed ? "fulfilled" : cancelled ? "cancelled" : "pending",
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
    processed_at: iso(new Date(createdAt.getTime() + 30 * 60 * 1000)),
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
      demo_qr_code: `DEMO-${itemId.slice(0, 13).toUpperCase()}`,
      check_in_at: completedAt ? iso(slotStart) : null,
      cancelled_at: null,
      created_at: iso(createdAt),
    });
  }

  if (!completed) return;

  rows.reviews.push({
    id: stableUuid(`${key}:review`),
    user_id: customer.id,
    order_item_id: itemId,
    vendor_id: vendor.id,
    outlet_id: outlet.id,
    product_id: product.id,
    rating: 4 + (outletIndex % 2),
    title: outletIndex % 2 === 0 ? "A memorable local experience" : "Worth adding to the itinerary",
    body: `We enjoyed ${product.name} at ${outlet.name}. The experience felt well organised and welcoming.`,
    is_visible: true,
    created_at: iso(new Date(completedAt.getTime() + DAY_MS)),
  });
  rows.voucherRedemptions.push({
    id: stableUuid(`${key}:voucher-redemption`),
    voucher_id: voucher.id,
    order_id: orderId,
    user_id: customer.id,
    discount,
    created_at: iso(createdAt),
  });
  rows.interactions.push({
    id: stableUuid(`${key}:interaction:view`),
    user_id: customer.id,
    event_type: "view",
    entity_type: "product",
    entity_id: product.id,
    dwell_ms: 20_000 + (outletIndex % 8) * 4_000,
    created_at: iso(new Date(createdAt.getTime() - DAY_MS)),
  });
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
    const hash = stableUuid(`${DEMO_PREFIX}:${vendor.id}:voucher`).replaceAll("-", "").slice(0, 10).toUpperCase();
    const voucher = {
      id: stableUuid(`${DEMO_PREFIX}:${vendor.id}:voucher`),
      vendor_id: vendor.id,
      outlet_id: null,
      code: `DEMO${hash}`,
      name: "Demo Traveller 10% Off",
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

    const eligible = productRows
      .map((product) => productAvailableAtOutlet(product, outlet, offersByOutlet))
      .filter(Boolean)
      .sort((left, right) => {
        const score = (candidate) => {
          if (candidate.direct && candidate.product.requires_booking) return 0;
          if (candidate.direct) return 1;
          if (!candidate.product.requires_booking) return 2;
          return 3;
        };
        return score(left) - score(right);
      })[0];
    if (!eligible) {
      issues.push({
        code: "outlet_without_eligible_product",
        vendorId: outlet.vendor_id,
        outletId: outlet.id,
        outletName: outlet.name,
      });
      return;
    }

    const customer = commerceCustomers[outletIndex % commerceCustomers.length];
    addPurchase(rows, {
      vendor,
      outlet,
      product: eligible.product,
      unitPrice: eligible.price,
      directProduct: eligible.direct,
      customer,
      scenario: "completed",
      outletIndex,
      voucher,
      now,
    });
    if (eligible.product.requires_booking) {
      addPurchase(rows, {
        vendor,
        outlet,
        product: eligible.product,
        unitPrice: eligible.price,
        directProduct: eligible.direct,
        customer: commerceCustomers[(outletIndex + 1) % commerceCustomers.length],
        scenario: "upcoming",
        outletIndex,
        voucher,
        now,
      });
    }

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
          body: `Hi, is ${eligible.product.name} available when I visit ${outlet.name}?`,
          context_product_id: eligible.product.id,
          created_at: iso(createdAt),
        },
        {
          id: stableUuid(`${threadKey}:message:vendor`),
          thread_id: threadId,
          sender_id: vendor.owner_id,
          body: `Yes, our team at ${outlet.name} can help you plan the visit. Please share your preferred date.`,
          context_product_id: eligible.product.id,
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
    },
  };
}
