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

describe("customer wallet history database query", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(new Response(JSON.stringify([{
      id: "tx-old", user_id: "alice", wallet_id: "wallet", order_id: null, withdrawal_id: null,
      type: "topup", amount_sen: 1234, bucket: "topup", direction: "credit", note: null, created_at: "2026-08-01T00:00:00Z",
    }]), { status: 200, headers: { "content-type": "application/json", "content-range": "125-125/126" } }));
  });

  it("queries all history before pagination and preserves exact count and mapped amounts", async () => {
    const result = await getCustomerWalletTransactionPage("alice", { ...DEFAULT_CUSTOMER_HISTORY_FILTERS, page: 6 });
    const params = new URL(String(request.mock.calls[0][0])).searchParams;
    expect(params.get("user_id")).toBe("eq.alice");
    expect(params.get("type")).toBe("neq.withdrawal_complete");
    expect(params.get("offset")).toBe("125");
    expect(params.get("limit")).toBe("25");
    expect(params.get("order")).toBe("created_at.desc,id.desc");
    expect(new Headers(request.mock.calls[0][1].headers).get("Prefer")).toContain("count=exact");
    expect(result.total).toBe(126);
    expect(result.transactions[0]).toMatchObject({ id: "tx-old", userId: "alice", amount: 12.34 });
  });

  it("combines filters in the database and uses the requested account each time", async () => {
    await getCustomerWalletTransactionPage("bob", { ...DEFAULT_CUSTOMER_HISTORY_FILTERS, type: "withdrawals", direction: "debit", from: "2026-09-01", to: "2026-09-04" });
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
    request.mockResolvedValue(new Response(JSON.stringify({ message: "denied" }), { status: 403 }));
    await expect(getCustomerWalletTransactionPage("alice", DEFAULT_CUSTOMER_HISTORY_FILTERS)).rejects.toMatchObject({ message: "denied" });
  });
});
