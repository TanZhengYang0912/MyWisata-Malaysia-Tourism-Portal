import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/backend/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://wallet.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: request },
  }) };
});

import { getCustomerWalletTransactionPage } from "../commerce";
import { DEFAULT_CUSTOMER_HISTORY_FILTERS } from "@/lib/wallet/customer-transaction-filters";

function pageResponse(rows: object[], total = rows.length, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? { message: "denied" } : rows), {
    status,
    headers: {
      "content-type": "application/json",
      ...(status < 400 ? { "content-range": rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}` } : {}),
    },
  });
}

function walletRow(index: number) {
  return {
    id: `tx-${index}`,
    user_id: "alice",
    wallet_id: "wallet",
    order_id: null,
    withdrawal_id: null,
    type: "topup",
    amount_sen: 1234,
    bucket: "topup",
    direction: "credit",
    note: null,
    created_at: new Date(Date.UTC(2026, 7, 31) - index * 86_400_000).toISOString(),
  };
}

describe("customer wallet history database query", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/orders?")) return Promise.resolve(pageResponse([], 0));
      if (url.includes("/refunds?")) return Promise.resolve(pageResponse([], 0));
      return Promise.resolve(pageResponse(Array.from({ length: 126 }, (_, index) => walletRow(index)), 126));
    });
  });

  it("merges customer purchases with wallet movements before combined pagination", async () => {
    request.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/orders?")) {
        return Promise.resolve(pageResponse([{
          id: "order-new",
          user_id: "alice",
          status: "completed",
          total_amount: 220,
          payment_method: "mock_card",
          created_at: "2026-09-02T03:00:00-02:00",
        }], 1));
      }
      if (url.includes("/refunds?")) {
        return Promise.resolve(pageResponse([{
          id: "refund-1",
          order_id: "order-refunded",
          amount: 45,
          status: "processed",
          processed_at: "2026-09-03T08:00:00Z",
          created_at: "2026-09-03T07:00:00Z",
          orders: { user_id: "alice", payment_method: "mock_card" },
        }], 1));
      }
      return Promise.resolve(pageResponse([{
        ...walletRow(0),
        id: "tx-earning",
        type: "earnings",
        amount_sen: 660,
        bucket: "earnings",
        created_at: "2026-09-02T04:00:00Z",
      }], 1));
    });

    const result = await getCustomerWalletTransactionPage("alice", DEFAULT_CUSTOMER_HISTORY_FILTERS);
    const calls = request.mock.calls.map(([input]) => new URL(String(input)));
    const orderParams = calls.find((url) => url.pathname.endsWith("/orders"))?.searchParams;

    expect(calls).toHaveLength(3);
    expect(orderParams?.get("user_id")).toBe("eq.alice");
    expect(orderParams?.get("status")).toBe("in.(paid,completed,refunded)");
    expect(orderParams?.get("payment_method")).toBe("not.in.(wallet,wallet_split)");
    expect(result.total).toBe(3);
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: "refund:refund-1",
        userId: "alice",
        walletId: null,
        orderId: "order-refunded",
        type: "refund",
        amount: 45,
        bucket: "external",
        direction: "credit",
      }),
      expect.objectContaining({
        id: "order:order-new",
        userId: "alice",
        walletId: null,
        orderId: "order-new",
        type: "spend",
        amount: 220,
        bucket: "external",
        direction: "debit",
      }),
      expect.objectContaining({ id: "tx-earning", type: "earnings", amount: 6.6 }),
    ]);
  });

  it("queries only ledger and external refund sources for the Refunds filter", async () => {
    request.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/refunds?")) return Promise.resolve(pageResponse([], 0));
      return Promise.resolve(pageResponse([], 0));
    });

    await getCustomerWalletTransactionPage("alice", {
      ...DEFAULT_CUSTOMER_HISTORY_FILTERS,
      type: "refund",
    });
    const calls = request.mock.calls.map(([input]) => new URL(String(input)));
    const refundParams = calls.find((url) => url.pathname.endsWith("/refunds"))?.searchParams;

    expect(calls).toHaveLength(2);
    expect(calls.some((url) => url.pathname.endsWith("/orders"))).toBe(false);
    expect(refundParams?.get("status")).toBe("eq.processed");
    expect(refundParams?.get("orders.user_id")).toBe("eq.alice");
    expect(refundParams?.get("orders.payment_method")).toBe("not.in.(wallet,wallet_split)");
  });

  it("fetches enough rows from each source before slicing a later combined page", async () => {
    const result = await getCustomerWalletTransactionPage("alice", { ...DEFAULT_CUSTOMER_HISTORY_FILTERS, page: 6 });
    const calls = request.mock.calls.map(([input]) => new URL(String(input)));

    expect(calls).toHaveLength(3);
    calls.forEach((url, index) => {
      expect(url.searchParams.get(url.pathname.endsWith("/refunds") ? "orders.user_id" : "user_id")).toBe("eq.alice");
      expect(url.searchParams.get("offset")).toBe("0");
      expect(url.searchParams.get("limit")).toBe("150");
      expect(new Headers(request.mock.calls[index][1].headers).get("Prefer")).toContain("count=exact");
    });
    expect(result.total).toBe(126);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: "tx-125", userId: "alice", amount: 12.34 });
  });

  it("combines ledger filters and skips the purchase source when it cannot match", async () => {
    await getCustomerWalletTransactionPage("bob", {
      ...DEFAULT_CUSTOMER_HISTORY_FILTERS,
      type: "withdrawals",
      direction: "debit",
      from: "2026-09-01",
      to: "2026-09-04",
    });
    expect(request).toHaveBeenCalledTimes(1);
    const params = new URL(String(request.mock.calls[0][0])).searchParams;
    expect(params.get("user_id")).toBe("eq.bob");
    expect(params.getAll("type")).toEqual(["neq.withdrawal_complete", "in.(withdrawal_reserve,withdrawal_cancel)"]);
    expect(params.get("direction")).toBe("eq.debit");
    expect(params.getAll("created_at")).toEqual(["gte.2026-08-31T16:00:00.000Z", "lt.2026-09-04T16:00:00.000Z"]);
  });

  it("rejects invalid input without querying and propagates backend errors", async () => {
    await expect(getCustomerWalletTransactionPage("", DEFAULT_CUSTOMER_HISTORY_FILTERS)).rejects.toThrow();
    await expect(getCustomerWalletTransactionPage("alice", { ...DEFAULT_CUSTOMER_HISTORY_FILTERS, from: "bad" })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(pageResponse([], 0, 403));
    await expect(getCustomerWalletTransactionPage("alice", DEFAULT_CUSTOMER_HISTORY_FILTERS)).rejects.toMatchObject({ message: "denied" });
  });
});
