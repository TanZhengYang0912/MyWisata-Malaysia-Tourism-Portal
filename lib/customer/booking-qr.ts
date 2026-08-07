const DEFAULT_ORIGIN = "http://localhost:3000";

export function buildBookingQrPayload(bookingId: string, origin = DEFAULT_ORIGIN): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return `${normalizedOrigin}/customer/bookings/${encodeURIComponent(bookingId)}`;
}
