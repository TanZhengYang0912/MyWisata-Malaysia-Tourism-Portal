export interface BookingTimeSummary {
  id: string;
  slotStartsAt?: string | null;
}

export function hasDifferentBookingTime(currentBookingId: string, bookings: BookingTimeSummary[]): boolean {
  const currentBooking = bookings.find((booking) => booking.id === currentBookingId);
  if (!currentBooking?.slotStartsAt) return false;

  return bookings.some((booking) => (
    booking.id !== currentBookingId
    && Boolean(booking.slotStartsAt)
    && booking.slotStartsAt !== currentBooking.slotStartsAt
  ));
}
