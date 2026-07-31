import { describe, expect, it } from "vitest";
import { getCheckoutErrorCode, getCheckoutErrorMessage } from "../errors";

describe("checkout error handling", () => {
  it("maps the atomic booking capacity error to an actionable message", () => {
    expect(getCheckoutErrorCode("booking_capacity_unavailable")).toBe("BOOKING_CAPACITY_UNAVAILABLE");
    expect(getCheckoutErrorMessage("booking_capacity_unavailable")).toContain("choose another available slot");
  });

  it("maps structured API errors as well as raw database messages", () => {
    expect(getCheckoutErrorCode({ code: "BOOKING_SLOT_INVALID", message: "booking_slot_invalid" })).toBe("BOOKING_SLOT_INVALID");
    expect(getCheckoutErrorMessage({ code: "INVENTORY_UNAVAILABLE" })).toContain("requested quantity");
  });

  it("does not expose database error text for unknown failures", () => {
    expect(getCheckoutErrorMessage("some_internal_postgres_error")).toBe("We could not start checkout right now. Please try again.");
  });

  it("maps voucher validation failures to actionable customer messages", () => {
    expect(getCheckoutErrorCode("voucher_minimum_spend")).toBe("VOUCHER_MINIMUM_SPEND");
    expect(getCheckoutErrorMessage("voucher_minimum_spend")).toContain("minimum spend");
    expect(getCheckoutErrorMessage("voucher_discount_mismatch")).toContain("discount could not be verified");
  });
});
