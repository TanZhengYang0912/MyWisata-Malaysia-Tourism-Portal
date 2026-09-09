import { describe, expect, it } from "vitest";

import { buildVendorAccountDemoPlan } from "../lib/vendor-account-demo.mjs";

const customerId = "aaaaaaaa-0000-0000-0000-000000000005";
const ownerId = "20000000-0000-0000-0000-000000000001";
const managerId = "30000000-0000-0000-0000-000000000001";
const vendorId = "40000000-0000-0000-0000-000000000001";
const outletId = "50000000-0000-0000-0000-000000000001";
const orderId = "60000000-0000-0000-0000-000000000001";

const baseInput = {
  vendors: [{ id: vendorId, owner_id: ownerId, name: "Heritage Trails", status: "approved" }],
  outlets: [{ id: outletId, vendor_id: vendorId, name: "Heritage Trails — Melaka", status: "active", review_status: "approved" }],
  products: [{ id: "80000000-0000-0000-0000-000000000001", vendor_id: vendorId, outlet_id: outletId, status: "active", review_status: "approved" }],
  outletOffers: [],
  outletManagers: [{ user_id: managerId, outlet_id: outletId }],
  orders: [{ id: orderId, user_id: customerId, status: "completed", created_at: "2026-09-01T03:00:00.000Z" }],
  orderItems: [{ id: "70000000-0000-0000-0000-000000000001", order_id: orderId, vendor_id: vendorId, outlet_id: outletId, product_id: "80000000-0000-0000-0000-000000000001", product_name: "Melaka Heritage Walk", line_total: 88 }],
  wallets: [{ id: "90000000-0000-0000-0000-000000000001", user_id: ownerId }],
  walletTransactions: [],
  notifications: [],
  authUserIds: [ownerId, managerId],
  customerIds: [customerId],
  now: new Date("2026-09-08T08:00:00.000Z"),
};

describe("vendor account demo planner", () => {
  it("plans one order-linked earning and correctly scoped role notifications", () => {
    const plan = buildVendorAccountDemoPlan(baseInput);

    expect(plan.issues).toEqual([]);
    expect(plan.earningActions).toEqual([expect.objectContaining({
      vendorId,
      ownerId,
      orderId,
      idempotencyKey: `vendor-account-demo:earning:${vendorId}:${orderId}`,
    })]);
    expect(plan.notificationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        user_id: ownerId,
        vendor_id: vendorId,
        outlet_id: null,
        audience_role: "vendor_owner",
        category: "vendor_orders",
        link: "/vendor/orders",
      }),
      expect.objectContaining({
        user_id: managerId,
        vendor_id: vendorId,
        outlet_id: outletId,
        audience_role: "outlet_manager",
        category: "vendor_orders",
        link: "/vendor/orders",
      }),
    ]));
    expect(plan.notificationRows).toHaveLength(2);
  });

  it("is deterministic and skips existing earnings and notifications", () => {
    const first = buildVendorAccountDemoPlan(baseInput);
    const existing = {
      ...baseInput,
      walletTransactions: [{
        user_id: ownerId,
        idempotency_key: first.earningActions[0].idempotencyKey,
        order_id: orderId,
      }],
      notifications: first.notificationRows.map((row) => ({ event_key: row.event_key })),
    };

    expect(buildVendorAccountDemoPlan(baseInput)).toEqual(first);
    expect(buildVendorAccountDemoPlan(existing)).toMatchObject({
      issues: [],
      earningActions: [],
      notificationRows: [],
    });
  });

  it("blocks missing login, assignment, Wallet, and customer-order paths", () => {
    const plan = buildVendorAccountDemoPlan({
      ...baseInput,
      outletManagers: [],
      wallets: [],
      authUserIds: [],
      orders: [],
      orderItems: [],
    });

    expect(new Set(plan.issues.map((issue) => issue.code))).toEqual(new Set([
      "vendor_owner_auth_missing",
      "vendor_owner_wallet_missing",
      "vendor_customer_order_missing",
      "outlet_manager_assignment_missing",
      "outlet_customer_order_missing",
    ]));
  });

  it("rejects cross-vendor order items and never credits their owner", () => {
    const plan = buildVendorAccountDemoPlan({
      ...baseInput,
      orderItems: [{
        ...baseInput.orderItems[0],
        vendor_id: "40000000-0000-0000-0000-000000000099",
      }],
    });

    expect(plan.earningActions).toEqual([]);
    expect(plan.notificationRows).toEqual([]);
    expect(new Set(plan.issues.map((issue) => issue.code))).toEqual(new Set([
      "vendor_customer_order_missing",
      "outlet_customer_order_missing",
    ]));
  });

  it("rejects an order item whose Product belongs to another Vendor", () => {
    const plan = buildVendorAccountDemoPlan({
      ...baseInput,
      products: [{
        ...baseInput.products[0],
        vendor_id: "40000000-0000-0000-0000-000000000099",
      }],
    });

    expect(plan.earningActions).toEqual([]);
    expect(plan.notificationRows).toEqual([]);
    expect(new Set(plan.issues.map((issue) => issue.code))).toEqual(new Set([
      "vendor_customer_order_missing",
      "outlet_customer_order_missing",
    ]));
  });

  it("accepts a Vendor Product offered at the order Outlet", () => {
    const plan = buildVendorAccountDemoPlan({
      ...baseInput,
      products: [{
        ...baseInput.products[0],
        outlet_id: "50000000-0000-0000-0000-000000000099",
      }],
      outletOffers: [{
        product_id: baseInput.products[0].id,
        outlet_id: outletId,
        status: "active",
      }],
    });

    expect(plan.issues).toEqual([]);
    expect(plan.earningActions).toHaveLength(1);
  });
});
