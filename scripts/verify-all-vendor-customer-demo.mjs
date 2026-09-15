#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  ADJUSTMENT_CREDIT_NOTE,
  ADJUSTMENT_DEBIT_NOTE,
  ADMIN_ID,
  ALICE_ID,
  DEMO_DESTINATION_REFERENCE,
  WITHDRAWAL_AMOUNT_SEN,
  createDemoKycHashes,
} from "./lib/alice-wallet-demo.mjs";
import {
  OUTLET_TIMELINE_SCENARIOS,
  stableUuid,
} from "./lib/vendor-customer-demo.mjs";

const CUSTOMER_IDS = new Set([5, 6, 7, 8].map(
  (number) => `aaaaaaaa-0000-0000-0000-${String(number).padStart(12, "0")}`,
));
const COMMERCE_SCOPE_PATH = path.resolve(process.cwd(), "scripts/data/enabled-commerce-outlet-scope.json");

function loadEnv() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filepath)) continue;
    for (const line of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
    break;
  }
}

loadEnv();

const commerceScope = JSON.parse(fs.readFileSync(COMMERCE_SCOPE_PATH, "utf8"));
const enabledOutletIds = new Set(commerceScope.outlets.map((outlet) => outlet.id));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const kycHmacKey = process.env.KYC_IC_HMAC_KEY;
if (!url || !serviceKey || !kycHmacKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY, or KYC_IC_HMAC_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readAll(table, select) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(start, start + 999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function listAllAuthUserIds() {
  const ids = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth user read failed: ${error.message}`);
    const authUsers = data?.users ?? [];
    ids.push(...authUsers.map((user) => user.id));
    if (authUsers.length < 1000) return ids;
  }
}

function activeApproved(row) {
  return row.status === "active" && (!row.review_status || row.review_status === "approved");
}

function names(rows) {
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
}

function assignedRoleName(assignment) {
  const role = Array.isArray(assignment.roles) ? assignment.roles[0] : assignment.roles;
  return role?.name ?? null;
}

function malaysiaDayIndex(value) {
  return Math.floor((new Date(value).getTime() + 8 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
}

async function main() {
  const [vendors, outlets, products, outletOffers, users, orders, orderItems, reviews, chatThreads, chatMessages, bookings, bookingSlots, vouchers, payments, refunds, wallets, walletTransactions, withdrawalRequests, walletAdjustments, payoutDestinations, kycSubmissions, kycOcrResults, outletManagers, userRoles, notifications, authUserIds] = await Promise.all([
    readAll("vendors", "id,owner_id,name,slug,status"),
    readAll("outlets", "id,vendor_id,name,slug,status,review_status"),
    readAll("products", "id,vendor_id,outlet_id,name,requires_booking,status,review_status"),
    readAll("outlet_offers", "id,product_id,outlet_id,status"),
    readAll("users", "id,status,kyc_status,email_verified_at,phone_verified_at"),
    readAll("orders", "id,user_id,status,total_amount,payment_method,paid_at,completed_at,cancelled_at,created_at"),
    readAll("order_items", "id,order_id,vendor_id,outlet_id,product_id,slot_id,line_total,fulfil_status"),
    readAll("reviews", "id,user_id,order_item_id,vendor_id,outlet_id,product_id,is_visible"),
    readAll("chat_threads", "id,customer_id,outlet_id,vendor_id"),
    readAll("chat_messages", "id,thread_id,sender_id"),
    readAll("bookings", "id,order_item_id,slot_id,customer_id,status"),
    readAll("booking_slots", "id,product_id,outlet_id,status"),
    readAll("vouchers", "id,vendor_id,is_active,review_status"),
    readAll("payments", "id,order_id,method,amount,status,processed_at"),
    readAll("refunds", "id,payment_id,order_id,amount,status,processed_at"),
    readAll("wallets", "id,user_id,topup_sen,earnings_sen,pending_earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen"),
    readAll("wallet_transactions", "id,user_id,wallet_id,order_id,withdrawal_id,idempotency_key,type,amount_sen,bucket,direction,note"),
    readAll("withdrawal_requests", "id,user_id,wallet_id,destination_id,amount,status"),
    readAll("wallet_adjustments", "id,user_id,wallet_transaction_id,actor_id,reason"),
    readAll("payout_destinations", "id,user_id,provider,provider_reference,verification_status,masked_ref"),
    readAll("kyc_submissions", "id,user_id,status,ic_hash,ic_hash_version"),
    readAll("kyc_ocr_results", "submission_id,status,document_number_hmac,provider_model"),
    readAll("outlet_managers", "user_id,outlet_id"),
    readAll("user_roles", "user_id,roles(name)"),
    readAll("notifications", "id,user_id,vendor_id,outlet_id,audience_role,category,event_key"),
    listAllAuthUserIds(),
  ]);

  const approvedVendorCatalog = vendors.filter((vendor) => vendor.status === "approved");
  const approvedVendorIds = new Set(approvedVendorCatalog.map((vendor) => vendor.id));
  const activeOutlets = outlets.filter(
    (outlet) => activeApproved(outlet) && approvedVendorIds.has(outlet.vendor_id),
  ).filter((outlet) => enabledOutletIds.has(outlet.id));
  const commerceVendorIds = new Set(activeOutlets.map((outlet) => outlet.vendor_id));
  const approvedVendors = approvedVendorCatalog.filter((vendor) => commerceVendorIds.has(vendor.id));
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const itemById = new Map(orderItems.map((item) => [item.id, item]));
  const paymentByOrderId = new Map(payments.map((payment) => [payment.order_id, payment]));
  const itemsByOrderId = new Map();
  for (const item of orderItems) {
    const current = itemsByOrderId.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrderId.set(item.order_id, current);
  }
  const slotById = new Map(bookingSlots.map((slot) => [slot.id, slot]));
  const customerIds = new Set(
    users
      .filter((user) => CUSTOMER_IDS.has(user.id) && user.status === "active")
      .map((user) => user.id),
  );
  const commerceCustomerIds = new Set(
    users
      .filter((user) =>
        CUSTOMER_IDS.has(user.id)
        && user.status === "active"
        && user.email_verified_at
        && user.phone_verified_at,
      )
      .map((user) => user.id),
  );
  const verificationNow = new Date();
  const currentMalaysiaDay = malaysiaDayIndex(verificationNow);
  const outletTimelineCoverageFailures = [];
  const outletTimelinePeriodMismatches = [];
  const outletTimelineCustomerDiversityMismatches = [];
  const outletTimelineLifecycleMismatches = [];
  const outletsWithCompleteTimeline = new Set();

  for (const outlet of activeOutlets) {
    const entries = OUTLET_TIMELINE_SCENARIOS.map((scenario) => {
      const orderId = stableUuid(`vendor-customer-demo:${outlet.id}:${scenario.key}:order`);
      const order = orderById.get(orderId);
      const item = (itemsByOrderId.get(orderId) ?? []).find(
        (candidate) => candidate.outlet_id === outlet.id && candidate.vendor_id === outlet.vendor_id,
      );
      return { scenario, orderId, order, item };
    });
    const missing = entries
      .filter((entry) => !entry.order || !entry.item)
      .map((entry) => ({ key: entry.scenario.key, orderId: entry.orderId }));
    if (missing.length > 0) {
      outletTimelineCoverageFailures.push({
        outletId: outlet.id,
        outletName: outlet.name,
        expected: OUTLET_TIMELINE_SCENARIOS.length,
        complete: entries.length - missing.length,
        missing,
      });
      continue;
    }

    const distinctCustomers = new Set(entries.map((entry) => entry.order.user_id));
    if (
      distinctCustomers.size !== commerceCustomerIds.size
      || [...distinctCustomers].some((id) => !commerceCustomerIds.has(id))
    ) {
      outletTimelineCustomerDiversityMismatches.push({
        outletId: outlet.id,
        outletName: outlet.name,
        expectedCustomers: commerceCustomerIds.size,
        customerIds: [...distinctCustomers],
      });
    }

    for (const entry of entries) {
      const { scenario, order, item, orderId } = entry;
      const payment = paymentByOrderId.get(orderId);
      const product = productById.get(item.product_id);
      const offeredBookableWithoutSlot = Boolean(
        product?.requires_booking
        && product.outlet_id !== outlet.id
        && !item.slot_id,
      );
      const expectedStatus = offeredBookableWithoutSlot && scenario.status === "paid"
        ? "cancelled"
        : scenario.status;
      const timestampIsNonFuture = (value) => Boolean(
        value && new Date(value).getTime() <= verificationNow.getTime(),
      );
      const reasons = [];

      if (order.status !== expectedStatus) reasons.push(`expected order status ${expectedStatus}`);
      if (!payment) {
        reasons.push("missing payment");
      } else {
        const expectedPaymentStatus = order.status === "cancelled" ? "cancelled" : "succeeded";
        if (payment.status !== expectedPaymentStatus) {
          reasons.push(`expected payment status ${expectedPaymentStatus}`);
        }
        if (Number(payment.amount) !== Number(order.total_amount)) {
          reasons.push("payment amount does not match order total");
        }
        if (!timestampIsNonFuture(payment.processed_at)) {
          reasons.push("payment processed_at is missing or in the future");
        }
      }

      if (order.status === "cancelled") {
        if (!timestampIsNonFuture(order.cancelled_at)) {
          reasons.push("cancelled_at is missing or in the future");
        }
        if (order.paid_at || order.completed_at) {
          reasons.push("cancelled order has paid_at or completed_at");
        }
        if (item.fulfil_status !== "cancelled") {
          reasons.push("cancelled order item is not cancelled");
        }
      } else if (order.status === "paid") {
        if (!timestampIsNonFuture(order.paid_at)) reasons.push("paid_at is missing or in the future");
        if (order.completed_at || order.cancelled_at) reasons.push("paid order has a terminal timestamp");
      } else if (order.status === "completed") {
        if (!timestampIsNonFuture(order.paid_at)) reasons.push("paid_at is missing or in the future");
        if (!timestampIsNonFuture(order.completed_at)) {
          reasons.push("completed_at is missing or in the future");
        } else if (new Date(order.paid_at).getTime() > new Date(order.completed_at).getTime()) {
          reasons.push("paid_at occurs after completed_at");
        }
        if (order.cancelled_at) reasons.push("completed order has cancelled_at");
        if (item.fulfil_status !== "fulfilled") reasons.push("completed order item is not fulfilled");
      }

      if (reasons.length > 0) {
        outletTimelineLifecycleMismatches.push({
          outletId: outlet.id,
          outletName: outlet.name,
          scenario: scenario.key,
          orderId,
          reasons,
        });
      }
    }

    const ages = entries.map((entry) => currentMalaysiaDay - malaysiaDayIndex(entry.order.created_at));
    const periods = {
      today: ages.filter((age) => age === 0).length,
      last7Days: ages.filter((age) => age >= 0 && age <= 7).length,
      last30Days: ages.filter((age) => age >= 0 && age <= 30).length,
      previous30Days: ages.filter((age) => age > 30 && age <= 60).length,
      olderWithin12Months: ages.filter((age) => age > 60 && age <= 365).length,
    };
    const expectedPeriods = {
      today: 1,
      last7Days: 3,
      last30Days: 6,
      previous30Days: 2,
      olderWithin12Months: 4,
    };
    if (Object.entries(expectedPeriods).some(([key, value]) => periods[key] !== value)) {
      outletTimelinePeriodMismatches.push({
        outletId: outlet.id,
        outletName: outlet.name,
        expected: expectedPeriods,
        actual: periods,
      });
      continue;
    }

    if (!outletTimelineCustomerDiversityMismatches.some((failure) => failure.outletId === outlet.id)) {
      outletsWithCompleteTimeline.add(outlet.id);
    }
  }
  const messageCountByThread = new Map();
  for (const message of chatMessages) {
    messageCountByThread.set(message.thread_id, (messageCountByThread.get(message.thread_id) ?? 0) + 1);
  }
  const activeOfferKeys = new Set(
    outletOffers
      .filter((offer) => offer.status === "active")
      .map((offer) => `${offer.product_id}:${offer.outlet_id}`),
  );

  const productIsAvailable = (product, outletId) =>
    product?.outlet_id === outletId || activeOfferKeys.has(`${product?.id}:${outletId}`);

  const orderItemOwnershipMismatches = orderItems.flatMap((item) => {
    const outlet = outletById.get(item.outlet_id);
    const product = productById.get(item.product_id);
    if (
      outlet &&
      product &&
      item.vendor_id === outlet.vendor_id &&
      item.vendor_id === product.vendor_id &&
      productIsAvailable(product, item.outlet_id)
    ) return [];
    return [{ id: item.id, vendorId: item.vendor_id, outletId: item.outlet_id, productId: item.product_id }];
  });

  const reviewOwnershipMismatches = reviews.flatMap((review) => {
    const item = itemById.get(review.order_item_id);
    const order = item ? orderById.get(item.order_id) : null;
    if (
      item &&
      order &&
      review.user_id === order.user_id &&
      review.vendor_id === item.vendor_id &&
      review.outlet_id === item.outlet_id &&
      review.product_id === item.product_id
    ) return [];
    return [{ id: review.id, orderItemId: review.order_item_id }];
  });

  const bookingPathMismatches = bookings.flatMap((booking) => {
    const item = itemById.get(booking.order_item_id);
    const slot = slotById.get(booking.slot_id);
    const order = item ? orderById.get(item.order_id) : null;
    if (
      item &&
      slot &&
      order &&
      booking.customer_id === order.user_id &&
      booking.slot_id === item.slot_id &&
      slot.product_id === item.product_id &&
      slot.outlet_id === item.outlet_id
    ) return [];
    return [{ id: booking.id, orderItemId: booking.order_item_id, slotId: booking.slot_id }];
  });

  const chatThreadMismatches = chatThreads.flatMap((thread) => {
    const outlet = outletById.get(thread.outlet_id);
    if (
      outlet &&
      customerIds.has(thread.customer_id) &&
      thread.vendor_id === outlet.vendor_id &&
      (messageCountByThread.get(thread.id) ?? 0) > 0
    ) return [];
    return [{
      id: thread.id,
      customerId: thread.customer_id,
      vendorId: thread.vendor_id,
      outletId: thread.outlet_id,
      messageCount: messageCountByThread.get(thread.id) ?? 0,
    }];
  });

  const qualifyingOrderItems = orderItems.filter((item) => {
    const order = orderById.get(item.order_id);
    const outlet = outletById.get(item.outlet_id);
    const product = productById.get(item.product_id);
    return (
      order &&
      outlet &&
      product &&
      commerceCustomerIds.has(order.user_id) &&
      ["paid", "completed"].includes(order.status) &&
      activeApproved(outlet) &&
      activeApproved(product) &&
      item.vendor_id === outlet.vendor_id &&
      item.vendor_id === product.vendor_id &&
      productIsAvailable(product, item.outlet_id)
    );
  });
  const qualifyingItemIds = new Set(qualifyingOrderItems.map((item) => item.id));
  const reviewMismatchIds = new Set(reviewOwnershipMismatches.map((mismatch) => mismatch.id));
  const qualifyingReviews = reviews.filter((review) =>
    review.is_visible &&
    commerceCustomerIds.has(review.user_id) &&
    qualifyingItemIds.has(review.order_item_id) &&
    !reviewMismatchIds.has(review.id),
  );
  const chatMismatchIds = new Set(chatThreadMismatches.map((mismatch) => mismatch.id));
  const validChatThreadIds = new Set(
    chatThreads
      .filter((thread) => !chatMismatchIds.has(thread.id))
      .map((thread) => thread.id),
  );
  const qualifyingChatThreads = chatThreads.filter((thread) => validChatThreadIds.has(thread.id));
  const bookingMismatchIds = new Set(bookingPathMismatches.map((mismatch) => mismatch.id));
  const validBookingIds = new Set(
    bookings
      .filter((booking) =>
        commerceCustomerIds.has(booking.customer_id) &&
        ["confirmed", "checked_in"].includes(booking.status) &&
        !bookingMismatchIds.has(booking.id),
      )
      .map((booking) => booking.id),
  );

  const outletsWithOrders = new Set(qualifyingOrderItems.map((item) => item.outlet_id));
  const outletsWithReviews = new Set(qualifyingReviews.map((review) => review.outlet_id));
  const outletsWithChats = new Set(qualifyingChatThreads.map((thread) => thread.outlet_id));
  const outletsWithBookings = new Set(
    bookings
      .filter((booking) => validBookingIds.has(booking.id))
      .map((booking) => itemById.get(booking.order_item_id)?.outlet_id)
      .filter(Boolean),
  );
  const vendorsWithOrders = new Set(qualifyingOrderItems.map((item) => item.vendor_id));
  const vendorsWithReviews = new Set(qualifyingReviews.map((review) => review.vendor_id));
  const vendorsWithChats = new Set(qualifyingChatThreads.map((thread) => thread.vendor_id));
  const vendorsWithVouchers = new Set(
    vouchers
      .filter((voucher) => voucher.is_active && (!voucher.review_status || voucher.review_status === "approved"))
      .map((voucher) => voucher.vendor_id),
  );

  const uncoveredOutlets = activeOutlets.filter(
    (outlet) => !outletsWithOrders.has(outlet.id) || !outletsWithReviews.has(outlet.id) || !outletsWithChats.has(outlet.id),
  );
  const uncoveredVendors = approvedVendors.filter(
    (vendor) =>
      !vendorsWithOrders.has(vendor.id) ||
      !vendorsWithReviews.has(vendor.id) ||
      !vendorsWithChats.has(vendor.id) ||
      !vendorsWithVouchers.has(vendor.id),
  );
  const bookableOutletIds = new Set();
  for (const outlet of activeOutlets) {
    if (products.some((product) =>
      product.requires_booking &&
      activeApproved(product) &&
      product.vendor_id === outlet.vendor_id &&
      product.outlet_id === outlet.id
    )) {
      bookableOutletIds.add(outlet.id);
    }
  }
  const bookableOutletsWithoutBookings = activeOutlets.filter(
    (outlet) => bookableOutletIds.has(outlet.id) && !outletsWithBookings.has(outlet.id),
  );
  const vendorsWithoutActiveOutlets = approvedVendors.filter(
    (vendor) => !activeOutlets.some((outlet) => outlet.vendor_id === vendor.id),
  );

  const authIdSet = new Set(authUserIds);
  const roleKeys = new Set(
    userRoles.map((assignment) => `${assignment.user_id}:${assignedRoleName(assignment)}`),
  );
  const activeOutletIds = new Set(activeOutlets.map((outlet) => outlet.id));
  const activeManagerAssignments = outletManagers.filter((assignment) => activeOutletIds.has(assignment.outlet_id));
  const managerAssignmentKeys = new Set(
    activeManagerAssignments.map((assignment) => `${assignment.user_id}:${assignment.outlet_id}`),
  );
  const walletByUserId = new Map(wallets.map((wallet) => [wallet.user_id, wallet]));
  const ownerAuthMissing = approvedVendors
    .filter((vendor) => !authIdSet.has(vendor.owner_id))
    .map((vendor) => ({ vendorId: vendor.id, ownerId: vendor.owner_id }));
  const managerAuthMissing = activeManagerAssignments
    .filter((assignment) => !authIdSet.has(assignment.user_id))
    .map((assignment) => ({ outletId: assignment.outlet_id, managerId: assignment.user_id }));
  const ownerRoleMismatches = approvedVendors
    .filter((vendor) => !roleKeys.has(`${vendor.owner_id}:vendor_owner`))
    .map((vendor) => ({ vendorId: vendor.id, ownerId: vendor.owner_id }));
  const managerRoleMismatches = activeManagerAssignments
    .filter((assignment) => !roleKeys.has(`${assignment.user_id}:outlet_manager`))
    .map((assignment) => ({ outletId: assignment.outlet_id, managerId: assignment.user_id }));

  const demoEarnings = walletTransactions.filter((transaction) => {
    const match = /^vendor-account-demo:earning:([0-9a-f-]{36}):/i.exec(transaction.idempotency_key ?? "");
    return Boolean(match && commerceVendorIds.has(match[1]));
  });
  const approvedVendorById = new Map(approvedVendors.map((vendor) => [vendor.id, vendor]));
  const qualifyingItemsByVendorOrder = new Map();
  for (const item of qualifyingOrderItems) {
    const key = `${item.vendor_id}:${item.order_id}`;
    if (!qualifyingItemsByVendorOrder.has(key)) qualifyingItemsByVendorOrder.set(key, []);
    qualifyingItemsByVendorOrder.get(key).push(item);
  }
  const validDemoEarningsByVendor = new Map();
  const ownerEarningOwnershipMismatches = demoEarnings.flatMap((transaction) => {
    const match = /^vendor-account-demo:earning:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(
      transaction.idempotency_key ?? "",
    );
    const vendorId = match?.[1];
    const orderId = match?.[2];
    const vendor = vendorId ? approvedVendorById.get(vendorId) : null;
    const items = vendorId && orderId
      ? qualifyingItemsByVendorOrder.get(`${vendorId}:${orderId}`) ?? []
      : [];
    const expectedAmountSen = Math.round(
      items.reduce((total, item) => total + Number(item.line_total), 0) * 100,
    );
    const valid = Boolean(
      vendor
      && orderId === transaction.order_id
      && transaction.idempotency_key === `vendor-account-demo:earning:${vendor.id}:${transaction.order_id}`
      && transaction.user_id === vendor.owner_id
      && transaction.wallet_id === walletByUserId.get(vendor.owner_id)?.id
      && transaction.type === "earnings"
      && transaction.direction === "credit"
      && transaction.bucket === "earnings"
      && expectedAmountSen > 0
      && Number(transaction.amount_sen) === expectedAmountSen
    );
    if (valid) {
      if (!validDemoEarningsByVendor.has(vendor.id)) validDemoEarningsByVendor.set(vendor.id, []);
      validDemoEarningsByVendor.get(vendor.id).push(transaction);
      return [];
    }
    return [{
      transactionId: transaction.id,
      userId: transaction.user_id,
      orderId: transaction.order_id,
      idempotencyKey: transaction.idempotency_key,
      amountSen: Number(transaction.amount_sen),
      expectedAmountSen,
    }];
  });
  const ownerOrderEarningMissing = approvedVendors.flatMap((vendor) => {
    const matching = validDemoEarningsByVendor.get(vendor.id) ?? [];
    return matching.length > 0 ? [] : [{ vendorId: vendor.id, ownerId: vendor.owner_id }];
  });
  const ownerOrderEarningCardinalityMismatches = approvedVendors.flatMap((vendor) => {
    const matching = validDemoEarningsByVendor.get(vendor.id) ?? [];
    return matching.length === 1 ? [] : [{
      vendorId: vendor.id,
      ownerId: vendor.owner_id,
      validEarningCount: matching.length,
    }];
  });
  const vendorOwnerWalletReconciliationMismatches = [...new Set(approvedVendors.map((vendor) => vendor.owner_id))]
    .flatMap((ownerId) => {
      const wallet = walletByUserId.get(ownerId);
      if (!wallet) return [{ ownerId, code: "vendor_owner_wallet_missing" }];
      const ledgerEarningsSen = walletTransactions
        .filter((transaction) => transaction.user_id === ownerId && transaction.wallet_id === wallet.id)
        .reduce((total, transaction) => {
          if (transaction.bucket !== "earnings" || transaction.type === "withdrawal_complete") return total;
          return total + (transaction.direction === "credit" ? 1 : -1) * Number(transaction.amount_sen);
        }, 0);
      return Number(wallet.earnings_sen) === ledgerEarningsSen ? [] : [{
        ownerId,
        walletId: wallet.id,
        storedSen: Number(wallet.earnings_sen),
        ledgerSen: ledgerEarningsSen,
      }];
    });

  const ownerOrderNotificationMissing = approvedVendors.flatMap((vendor) => {
    const eventKey = `vendor-account-demo:notification:order:owner:${vendor.id}:${vendor.owner_id}`;
    const notification = notifications.find((candidate) => candidate.event_key === eventKey);
    return notification
      && notification.user_id === vendor.owner_id
      && notification.vendor_id === vendor.id
      && notification.outlet_id === null
      && notification.audience_role === "vendor_owner"
      && notification.category === "vendor_orders"
      ? []
      : [{ vendorId: vendor.id, ownerId: vendor.owner_id }];
  });
  const ownerWalletNotificationMissing = approvedVendors.flatMap((vendor) => {
    const prefix = `vendor-account-demo:notification:wallet:${vendor.id}:`;
    const notification = notifications.find((candidate) => candidate.event_key?.startsWith(prefix));
    return notification
      && notification.user_id === vendor.owner_id
      && notification.vendor_id === vendor.id
      && notification.outlet_id === null
      && notification.audience_role === "vendor_owner"
      && notification.category === "vendor_wallet"
      ? []
      : [{ vendorId: vendor.id, ownerId: vendor.owner_id }];
  });
  const managerNotificationMissing = activeManagerAssignments.flatMap((assignment) => {
    const outlet = outletById.get(assignment.outlet_id);
    const eventKey = `vendor-account-demo:notification:order:manager:${assignment.outlet_id}:${assignment.user_id}`;
    const notification = notifications.find((candidate) => candidate.event_key === eventKey);
    return notification
      && notification.user_id === assignment.user_id
      && notification.vendor_id === outlet?.vendor_id
      && notification.outlet_id === assignment.outlet_id
      && notification.audience_role === "outlet_manager"
      && notification.category === "vendor_orders"
      ? []
      : [{ outletId: assignment.outlet_id, managerId: assignment.user_id }];
  });
  const managerNotificationScopeMismatches = notifications
    .filter((notification) =>
      notification.event_key?.startsWith("vendor-account-demo:notification:order:manager:"),
    )
    .filter((notification) =>
      commerceVendorIds.has(notification.vendor_id)
      && enabledOutletIds.has(notification.outlet_id),
    )
    .flatMap((notification) => {
      const outlet = outletById.get(notification.outlet_id);
      if (
        notification.audience_role === "outlet_manager"
        && managerAssignmentKeys.has(`${notification.user_id}:${notification.outlet_id}`)
        && outlet?.vendor_id === notification.vendor_id
      ) return [];
      return [{
        notificationId: notification.id,
        userId: notification.user_id,
        vendorId: notification.vendor_id,
        outletId: notification.outlet_id,
      }];
    });
  const managerOwnerOnlyNotificationMismatches = notifications
    .filter((notification) =>
      notification.audience_role === "outlet_manager"
      && ["vendor_wallet", "vendor_account"].includes(notification.category),
    )
    .map((notification) => ({
      notificationId: notification.id,
      userId: notification.user_id,
      category: notification.category,
    }));

  const alice = users.find((user) => user.id === ALICE_ID);
  const aliceWallet = wallets.find((wallet) => wallet.user_id === ALICE_ID);
  const aliceTransactions = walletTransactions.filter((transaction) => transaction.user_id === ALICE_ID);
  const creditAdjustments = aliceTransactions.filter((transaction) => transaction.note === ADJUSTMENT_CREDIT_NOTE);
  const debitAdjustments = aliceTransactions.filter((transaction) => transaction.note === ADJUSTMENT_DEBIT_NOTE);
  const creditAdjustment = creditAdjustments[0] ?? null;
  const debitAdjustment = debitAdjustments[0] ?? null;
  const refund = refunds.find((candidate) =>
    candidate.id === stableUuid("vendor-customer-demo:alice:external-refund"),
  );
  const refundOrder = refund ? orders.find((order) => order.id === refund.order_id) : null;
  const refundPayment = refund ? payments.find((payment) => payment.id === refund.payment_id) : null;
  const aliceDestination = payoutDestinations.find((destination) =>
    destination.user_id === ALICE_ID &&
    destination.provider === "tng_direct_credit" &&
    destination.provider_reference === DEMO_DESTINATION_REFERENCE &&
    destination.verification_status === "verified",
  );
  const aliceWithdrawal = aliceDestination && aliceWallet
    ? withdrawalRequests.find((withdrawal) =>
        withdrawal.user_id === ALICE_ID &&
        withdrawal.wallet_id === aliceWallet.id &&
        withdrawal.destination_id === aliceDestination.id &&
        Number(withdrawal.amount) === WITHDRAWAL_AMOUNT_SEN / 100 &&
        withdrawal.status === "rejected",
      )
    : null;
  const withdrawalReserve = aliceWithdrawal && aliceWallet
    ? aliceTransactions.find((transaction) =>
        transaction.wallet_id === aliceWallet.id &&
        transaction.withdrawal_id === aliceWithdrawal.id &&
        transaction.type === "withdrawal_reserve" &&
        transaction.direction === "debit" &&
        transaction.bucket === "earnings" &&
        Number(transaction.amount_sen) === WITHDRAWAL_AMOUNT_SEN,
      )
    : null;
  const withdrawalCancel = aliceWithdrawal && aliceWallet
    ? aliceTransactions.find((transaction) =>
        transaction.wallet_id === aliceWallet.id &&
        transaction.withdrawal_id === aliceWithdrawal.id &&
        transaction.type === "withdrawal_cancel" &&
        transaction.direction === "credit" &&
        transaction.bucket === "earnings" &&
        Number(transaction.amount_sen) === WITHDRAWAL_AMOUNT_SEN,
      )
    : null;
  const creditAdjustmentAudit = creditAdjustment
    ? walletAdjustments.find((adjustment) => adjustment.wallet_transaction_id === creditAdjustment.id)
    : null;
  const debitAdjustmentAudit = debitAdjustment
    ? walletAdjustments.find((adjustment) => adjustment.wallet_transaction_id === debitAdjustment.id)
    : null;
  const demoKycHashes = createDemoKycHashes(kycHmacKey);
  const aliceKycSubmission = kycSubmissions.find((submission) =>
    submission.user_id === ALICE_ID &&
    submission.status === "approved" &&
    submission.ic_hash_version === "hmac_sha256_v1" &&
    submission.ic_hash === demoKycHashes.identity,
  );
  const aliceKycOcr = aliceKycSubmission
      ? kycOcrResults.find((ocr) =>
        ocr.submission_id === aliceKycSubmission.id &&
        ocr.status === "matched" &&
        ocr.document_number_hmac === demoKycHashes.document &&
        ocr.provider_model === "deterministic-demo-fixture",
      )
    : null;
  const aliceWalletHistoryFailures = [];
  if (alice?.kyc_status !== "approved" || !aliceKycSubmission || !aliceKycOcr) {
    aliceWalletHistoryFailures.push({ code: "alice_kyc_not_approved" });
  }
  if (!aliceDestination) aliceWalletHistoryFailures.push({ code: "alice_payout_destination_missing" });
  if (!aliceWithdrawal || !withdrawalReserve || !withdrawalCancel) {
    aliceWalletHistoryFailures.push({ code: "alice_withdrawal_history_missing" });
  }
  if (
    creditAdjustments.length !== 1 ||
    !creditAdjustment ||
    !aliceWallet ||
    creditAdjustment.wallet_id !== aliceWallet.id ||
    creditAdjustment.type !== "adjustment_credit" ||
    creditAdjustment.direction !== "credit" ||
    creditAdjustment.bucket !== "earnings" ||
    creditAdjustment.order_id !== null ||
    creditAdjustment.withdrawal_id !== null ||
    !creditAdjustmentAudit ||
    creditAdjustmentAudit.user_id !== ALICE_ID ||
    creditAdjustmentAudit.actor_id !== ADMIN_ID ||
    creditAdjustmentAudit.reason !== ADJUSTMENT_CREDIT_NOTE
  ) aliceWalletHistoryFailures.push({ code: "alice_adjustment_credit_invalid" });
  if (
    debitAdjustments.length !== 1 ||
    !debitAdjustment ||
    !aliceWallet ||
    debitAdjustment.wallet_id !== aliceWallet.id ||
    debitAdjustment.type !== "adjustment_debit" ||
    debitAdjustment.direction !== "debit" ||
    debitAdjustment.bucket !== "earnings" ||
    debitAdjustment.order_id !== null ||
    debitAdjustment.withdrawal_id !== null ||
    !debitAdjustmentAudit ||
    debitAdjustmentAudit.user_id !== ALICE_ID ||
    debitAdjustmentAudit.actor_id !== ADMIN_ID ||
    debitAdjustmentAudit.reason !== ADJUSTMENT_DEBIT_NOTE
  ) aliceWalletHistoryFailures.push({ code: "alice_adjustment_debit_invalid" });
  if (creditAdjustment && debitAdjustment && creditAdjustment.amount_sen !== debitAdjustment.amount_sen) {
    aliceWalletHistoryFailures.push({ code: "alice_adjustment_amount_mismatch" });
  }
  if (
    !refund ||
    refund.status !== "processed" ||
    refundOrder?.user_id !== ALICE_ID ||
    refundOrder.status !== "refunded" ||
    refundOrder.payment_method !== "mock_card" ||
    refundPayment?.order_id !== refundOrder.id ||
    refundPayment.status !== "refunded" ||
    Number(refund.amount) !== Number(refundOrder.total_amount)
  ) aliceWalletHistoryFailures.push({ code: "alice_external_refund_invalid" });

  const ledgerBuckets = aliceTransactions.reduce((totals, transaction) => {
    if (transaction.type === "withdrawal_complete") return totals;
    const sign = transaction.direction === "credit" ? 1 : -1;
    totals[transaction.bucket] = (totals[transaction.bucket] ?? 0) + sign * Number(transaction.amount_sen);
    return totals;
  }, {});
  const walletReconciliationMismatches = [];
  if (!aliceWallet) {
    walletReconciliationMismatches.push({ code: "alice_wallet_missing" });
  } else {
    for (const [column, bucket] of [["topup_sen", "topup"], ["earnings_sen", "earnings"], ["pending_earnings_sen", "pending_earnings"]]) {
      if (Number(aliceWallet[column]) !== Number(ledgerBuckets[bucket] ?? 0)) {
        walletReconciliationMismatches.push({
          code: "alice_wallet_bucket_mismatch",
          bucket,
          storedSen: Number(aliceWallet[column]),
          ledgerSen: Number(ledgerBuckets[bucket] ?? 0),
        });
      }
    }
    if (Number(aliceWallet.reserved_earnings_sen) !== 0) {
      walletReconciliationMismatches.push({ code: "alice_reserved_earnings_not_released" });
    }
  }

  const failures = {
    uncoveredVendors: names(uncoveredVendors),
    uncoveredOutlets: names(uncoveredOutlets),
    bookableOutletsWithoutBookings: names(bookableOutletsWithoutBookings),
    vendorsWithoutActiveOutlets: names(vendorsWithoutActiveOutlets),
    orderItemOwnershipMismatches,
    reviewOwnershipMismatches,
    bookingPathMismatches,
    chatThreadMismatches,
    ownerAuthMissing,
    managerAuthMissing,
    ownerRoleMismatches,
    managerRoleMismatches,
    ownerOrderEarningMissing,
    ownerOrderEarningCardinalityMismatches,
    ownerEarningOwnershipMismatches,
    vendorOwnerWalletReconciliationMismatches,
    ownerOrderNotificationMissing,
    ownerWalletNotificationMissing,
    managerNotificationMissing,
    managerNotificationScopeMismatches,
    managerOwnerOnlyNotificationMismatches,
    outletTimelineCoverageFailures,
    outletTimelinePeriodMismatches,
    outletTimelineCustomerDiversityMismatches,
    outletTimelineLifecycleMismatches,
    aliceWalletHistoryFailures,
    walletReconciliationMismatches,
  };
  const failureCount = Object.values(failures).reduce((total, rows) => total + rows.length, 0);
  const result = {
    ok: failureCount === 0,
    totals: {
      approvedVendors: approvedVendors.length,
      activeApprovedOutlets: activeOutlets.length,
      products: products.length,
      orders: orders.length,
      orderItems: orderItems.length,
      reviews: reviews.length,
      chatThreads: chatThreads.length,
      bookings: bookings.length,
      vouchers: vouchers.length,
      refunds: refunds.length,
      walletTransactions: walletTransactions.length,
      vendorNotifications: notifications.filter((notification) => notification.vendor_id).length,
      vendorOwners: approvedVendors.length,
      outletManagers: activeManagerAssignments.length,
      deterministicTimelineOrders: activeOutlets.length * OUTLET_TIMELINE_SCENARIOS.length,
    },
    coverage: {
      vendorsWithOrders: approvedVendors.filter((vendor) => vendorsWithOrders.has(vendor.id)).length,
      vendorsWithReviews: approvedVendors.filter((vendor) => vendorsWithReviews.has(vendor.id)).length,
      vendorsWithChats: approvedVendors.filter((vendor) => vendorsWithChats.has(vendor.id)).length,
      vendorsWithVouchers: approvedVendors.filter((vendor) => vendorsWithVouchers.has(vendor.id)).length,
      outletsWithOrders: activeOutlets.filter((outlet) => outletsWithOrders.has(outlet.id)).length,
      outletsWithReviews: activeOutlets.filter((outlet) => outletsWithReviews.has(outlet.id)).length,
      outletsWithChats: activeOutlets.filter((outlet) => outletsWithChats.has(outlet.id)).length,
      bookableOutletsWithBookings: activeOutlets.filter((outlet) => bookableOutletIds.has(outlet.id) && outletsWithBookings.has(outlet.id)).length,
      bookableOutlets: bookableOutletIds.size,
      ownersWithOrderEarnings: approvedVendors.length - ownerOrderEarningCardinalityMismatches.length,
      ownersWithOrderNotifications: approvedVendors.length - ownerOrderNotificationMissing.length,
      ownersWithWalletNotifications: approvedVendors.length - ownerWalletNotificationMissing.length,
      managersWithOperationalNotifications: activeManagerAssignments.length - managerNotificationMissing.length,
      outletsWithCompleteTimeline: outletsWithCompleteTimeline.size,
    },
    aliceWalletHistory: {
      kycApproved: alice?.kyc_status === "approved",
      verifiedPayoutDestination: Boolean(aliceDestination),
      withdrawalStatus: aliceWithdrawal?.status ?? null,
      refundStatus: refund?.status ?? null,
      adjustmentCreditSen: Number(creditAdjustment?.amount_sen ?? 0),
      adjustmentDebitSen: Number(debitAdjustment?.amount_sen ?? 0),
      walletBalanceSen: aliceWallet
        ? Number(aliceWallet.topup_sen) + Number(aliceWallet.earnings_sen)
        : null,
    },
    failures,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
