import { describe, expect, it } from "vitest";
import { DEFAULT_CUSTOMER_HISTORY_FILTERS, buildCustomerHistoryQuery } from "../customer-transaction-filters";

describe("customer history query", () => {
  it("defaults to all directions and types with 25 rows", () => {
    expect(buildCustomerHistoryQuery(DEFAULT_CUSTOMER_HISTORY_FILTERS)).toEqual({ ok: true, offset: 0, pageSize: 25 });
  });

  it("combines type and direction and paginates beyond the old 100-row cap", () => {
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, type: "withdrawals", direction: "credit", page: 6 })).toEqual({
      ok: true, offset: 125, pageSize: 25, types: ["withdrawal_reserve", "withdrawal_cancel"], direction: "credit",
    });
  });

  it("includes both selected Malaysia calendar days with an exclusive next-day bound", () => {
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, from: "2026-09-01", to: "2026-09-04" })).toMatchObject({
      ok: true, fromInclusive: "2026-08-31T16:00:00.000Z", toExclusive: "2026-09-04T16:00:00.000Z",
    });
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, from: "2024-02-29", to: "2024-02-29" })).toMatchObject({ ok: true, toExclusive: "2024-02-29T16:00:00.000Z" });
  });

  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "bad"])("rejects invalid date %s", (from) => {
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, from })).toEqual({ ok: false, error: "invalidDate" });
  });

  it("rejects reversed dates and unsafe pages", () => {
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, from: "2026-09-04", to: "2026-09-01" })).toEqual({ ok: false, error: "invalidRange" });
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, page: 0 }).ok).toBe(false);
  });

  it("groups all earning and adjustment ledger events without changing the vendor grouping", () => {
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, type: "earnings" })).toMatchObject({ types: ["earnings", "earnings_pending", "earnings_confirm", "earnings_reverse"] });
    expect(buildCustomerHistoryQuery({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS, type: "adjustment" })).toMatchObject({ types: ["adjustment_credit", "adjustment_debit"] });
  });
});
