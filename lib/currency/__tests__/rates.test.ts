import { describe, expect, it, vi } from "vitest";
import { getReferenceRate } from "../rates";

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("BNM reference rate reader", () => {
  it("does not fetch a rate when MYR is selected", async () => {
    const fetcher = vi.fn();

    await expect(getReferenceRate("MYR", fetcher as typeof fetch)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches and normalizes one cached BNM quote", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([
      { date: "2026-09-11", base: "MYR", quote: "USD", rate: 0.24561 },
    ]));

    await expect(getReferenceRate("USD", fetcher as typeof fetch)).resolves.toEqual({
      date: "2026-09-11",
      base: "MYR",
      quote: "USD",
      rate: 0.24561,
      provider: "BNM",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.frankfurter.dev/v2/rates?base=MYR&quotes=USD&providers=BNM",
      expect.objectContaining({
        cache: "force-cache",
        next: { revalidate: 86_400 },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    { body: null, label: "null payload" },
    { body: [], label: "empty payload" },
    { body: [{ date: "not-a-date", base: "MYR", quote: "USD", rate: 0.24 }], label: "invalid date" },
    { body: [{ date: "2026-09-11", base: "EUR", quote: "USD", rate: 0.24 }], label: "wrong base" },
    { body: [{ date: "2026-09-11", base: "MYR", quote: "EUR", rate: 0.24 }], label: "wrong quote" },
    { body: [{ date: "2026-09-11", base: "MYR", quote: "USD", rate: 0 }], label: "zero rate" },
    { body: [{ date: "2026-09-11", base: "MYR", quote: "USD", rate: -1 }], label: "negative rate" },
    { body: [{ date: "2026-09-11", base: "MYR", quote: "USD", rate: "0.24" }], label: "non-numeric rate" },
  ])("fails closed for $label", async ({ body }) => {
    const fetcher = vi.fn().mockResolvedValue(response(body));

    await expect(getReferenceRate("USD", fetcher as typeof fetch)).resolves.toBeNull();
  });

  it("fails closed for provider errors", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("offline"));
    const httpFailure = vi.fn().mockResolvedValue(response({}, false));

    await expect(getReferenceRate("USD", rejected as typeof fetch)).resolves.toBeNull();
    await expect(getReferenceRate("USD", httpFailure as typeof fetch)).resolves.toBeNull();
  });
});
