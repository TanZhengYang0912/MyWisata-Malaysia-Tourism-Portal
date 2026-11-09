const DEFAULT_ORIGIN = "http://localhost:3000";

export function buildBookingQrPayload(
  bookingId: string,
  origin = DEFAULT_ORIGIN,
  token?: string,
): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const base = `${normalizedOrigin}/customer/bookings/${encodeURIComponent(bookingId)}`;
  if (token) {
    return `${base}?t=${encodeURIComponent(token)}`;
  }
  return base;
}

export function buildSignedTicketQrPayload(
  bookingId: string,
  passToken: string,
  origin = DEFAULT_ORIGIN,
): string {
  return buildBookingQrPayload(bookingId, origin, passToken);
}

export function buildTicketPassQrPayload({
  bookingId,
  orderId,
  ticketCode,
  passToken,
  origin,
}: {
  bookingId: string;
  orderId?: string | null;
  ticketCode?: string | null;
  passToken?: string;
  origin?: string;
}): string {
  if (ticketCode) return ticketCode.replace(/-/g, "");
  if (orderId) return "";
  return passToken ? buildBookingQrPayload(bookingId, origin, passToken) : "";
}
