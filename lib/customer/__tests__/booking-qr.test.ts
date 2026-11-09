import { describe, expect, it } from "vitest";
import { buildBookingQrPayload, buildSignedTicketQrPayload, buildTicketPassQrPayload } from "@/lib/customer/booking-qr";

describe("booking QR payload", () => {
  it("normalizes the origin and encodes the real booking detail URL", () => {
    expect(buildBookingQrPayload("booking/123", "https://mylawatan.test/")).toBe("https://mylawatan.test/customer/bookings/booking%2F123");
  });

  it("uses a stable local origin fallback", () => {
    expect(buildBookingQrPayload("booking-123")).toBe("http://localhost:3000/customer/bookings/booking-123");
  });

  it("appends signed ticket token when provided", () => {
    expect(buildSignedTicketQrPayload("booking-123", "v1.abc.def", "https://mylawatan.test/")).toBe(
      "https://mylawatan.test/customer/bookings/booking-123?t=v1.abc.def",
    );
  });

  it("uses the short ticket code for order-backed passes", () => {
    expect(buildTicketPassQrPayload({
      bookingId: "booking-123",
      orderId: "order-123",
      ticketCode: "T-ABCDE-FGHJK",
      passToken: "signed-token",
      origin: "https://mylawatan.test",
    })).toBe("TABCDEFGHJK");
  });

  it("does not fall back to a long signed URL while an order-backed code is unavailable", () => {
    expect(buildTicketPassQrPayload({
      bookingId: "booking-123",
      orderId: "order-123",
      passToken: "signed-token",
      origin: "https://mylawatan.test",
    })).toBe("");
  });

  it("keeps the signed URL for legacy bookings without an order ID", () => {
    expect(buildTicketPassQrPayload({
      bookingId: "booking-123",
      passToken: "signed-token",
      origin: "https://mylawatan.test",
    })).toBe("https://mylawatan.test/customer/bookings/booking-123?t=signed-token");
  });
});
