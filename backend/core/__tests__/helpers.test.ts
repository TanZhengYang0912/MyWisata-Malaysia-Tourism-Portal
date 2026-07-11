import { describe, expect, it } from "vitest";
import { canTransition, cartTotals, haversineKm, validateVoucher, voucherDiscount } from "../helpers";
import type { Activity, Voucher } from "../types";

const activity: Activity = {
  id: "a1", outletId: "o1", name: "Test Activity", category: "Food & Dining",
  description: "", image: "", price: 100, rating: 4.5, reviews: 10, duration: "2 hrs",
  requiresBooking: true,
  variants: [
    { id: "adult", label: "Adult", priceDelta: 0 },
    { id: "child", label: "Child", priceDelta: -15 },
  ],
};

const now = new Date("2026-07-10T00:00:00Z");

describe("validateVoucher", () => {
  const base: Voucher = { id: "v1", code: "TEST", type: "percent", value: 10, minSpend: 0, usageCap: 10, usageCount: 0, expiresAt: "2026-12-31" };

  it("accepts a valid voucher", () => {
    expect(validateVoucher(base, 100, now)).toEqual({ ok: true });
  });

  it("rejects an expired voucher", () => {
    expect(validateVoucher({ ...base, expiresAt: "2026-01-01" }, 100, now)).toMatchObject({ ok: false });
  });

  it("rejects when usage cap reached", () => {
    expect(validateVoucher({ ...base, usageCount: 10 }, 100, now)).toMatchObject({ ok: false });
  });

  it("rejects when minimum spend not met", () => {
    expect(validateVoucher({ ...base, minSpend: 300 }, 100, now)).toMatchObject({ ok: false });
  });
});

describe("voucherDiscount", () => {
  it("computes percent discount", () => {
    const v: Voucher = { id: "v1", code: "P10", type: "percent", value: 10, minSpend: 0, usageCap: 10, usageCount: 0, expiresAt: "2026-12-31" };
    expect(voucherDiscount(v, 200)).toBe(20);
  });

  it("computes fixed discount, capped at subtotal", () => {
    const v: Voucher = { id: "v2", code: "F50", type: "fixed", value: 50, minSpend: 0, usageCap: 10, usageCount: 0, expiresAt: "2026-12-31" };
    expect(voucherDiscount(v, 30)).toBe(30);
  });
});

describe("cartTotals", () => {
  it("sums qty * unit price across variants", () => {
    const totals = cartTotals(
      [{ activityId: "a1", variantId: "adult", qty: 2 }, { activityId: "a1", variantId: "child", qty: 1 }],
      [activity],
    );
    // 2*100 + 1*85 = 285
    expect(totals.subtotal).toBe(285);
    expect(totals.total).toBe(285);
  });

  it("applies a valid voucher discount to total", () => {
    const voucher: Voucher = { id: "v1", code: "TEST", type: "percent", value: 10, minSpend: 0, usageCap: 10, usageCount: 0, expiresAt: "2026-12-31" };
    const totals = cartTotals([{ activityId: "a1", variantId: "adult", qty: 1 }], [activity], voucher, now);
    expect(totals.discount).toBe(10);
    expect(totals.total).toBe(90);
    expect(totals.voucherError).toBeUndefined();
  });

  it("surfaces an error and skips discount for an invalid voucher", () => {
    const voucher: Voucher = { id: "v2", code: "EXP", type: "fixed", value: 5, minSpend: 0, usageCap: 10, usageCount: 0, expiresAt: "2026-01-01" };
    const totals = cartTotals([{ activityId: "a1", variantId: "adult", qty: 1 }], [activity], voucher, now);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(100);
    expect(totals.voucherError).toBeDefined();
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm({ lat: 3.139, lng: 101.6869 }, { lat: 3.139, lng: 101.6869 })).toBe(0);
  });

  it("computes a plausible KL-to-Penang distance", () => {
    const km = haversineKm({ lat: 3.139, lng: 101.6869 }, { lat: 5.4141, lng: 100.3288 });
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(300);
  });
});

describe("order state machine", () => {
  it("allows DRAFT -> PENDING_PAYMENT -> PAID -> COMPLETED", () => {
    expect(canTransition("DRAFT", "PENDING_PAYMENT")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition("PAID", "COMPLETED")).toBe(true);
  });

  it("allows cancellation before completion", () => {
    expect(canTransition("PENDING_PAYMENT", "CANCELLED")).toBe(true);
    expect(canTransition("PAID", "CANCELLED")).toBe(true);
  });

  it("disallows skipping states or transitioning out of terminal states", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
  });
});
