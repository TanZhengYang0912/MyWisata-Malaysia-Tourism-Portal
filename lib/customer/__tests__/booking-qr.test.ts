import { describe, expect, it } from "vitest";
import { buildBookingQrPayload, buildSignedTicketQrPayload } from "@/lib/customer/booking-qr";

describe("booking QR payload", () => {
  it("normalizes the origin and encodes the real booking detail URL", () => {
    expect(buildBookingQrPayload("booking/123", "https://mywisata.test/")).toBe("https://mywisata.test/customer/bookings/booking%2F123");
  });

  it("uses a stable local origin fallback", () => {
    expect(buildBookingQrPayload("booking-123")).toBe("http://localhost:3000/customer/bookings/booking-123");
  });

  it("appends signed ticket token when provided", () => {
    expect(buildSignedTicketQrPayload("booking-123", "v1.abc.def", "https://mywisata.test/")).toBe(
      "https://mywisata.test/customer/bookings/booking-123?t=v1.abc.def",
    );
  });
});
