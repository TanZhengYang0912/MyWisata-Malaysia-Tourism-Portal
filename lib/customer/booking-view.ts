export type BookingViewScope = 'upcoming' | 'past' | 'all';

type BookingViewRecord = {
  slotStartsAt?: string;
  status: string;
};

export function getBookingViewCopy(scope: BookingViewScope) {
  if (scope === 'past') {
    return {
      eyebrow: 'Booking history',
      title: 'Booking history',
      description: 'Review the experiences you have completed or missed.',
      historyAction: 'Back to upcoming',
    };
  }

  if (scope === 'all') {
    return {
      eyebrow: 'Booking overview',
      title: 'All bookings',
      description: 'See past and upcoming experiences together.',
      historyAction: 'Back to upcoming',
    };
  }

  return {
    eyebrow: 'Your itinerary',
    title: 'Booking calendar',
    description: 'See the experiences you have planned ahead.',
    historyAction: 'View booking history',
  };
}

export function getBookingViewStats(
  bookings: BookingViewRecord[],
  scope: BookingViewScope,
  now: number,
  monthStart: Date,
) {
  const thisMonth = bookings.filter((booking) => {
    if (!booking.slotStartsAt) return false;
    const date = new Date(booking.slotStartsAt);
    return date.getMonth() === monthStart.getMonth() && date.getFullYear() === monthStart.getFullYear();
  }).length;

  if (scope === 'past') {
    return [
      { label: 'Past bookings', value: bookings.length },
      { label: 'Past this month', value: thisMonth },
      { label: 'Cancelled / no-show', value: bookings.filter((booking) => ['cancelled', 'no_show'].includes(booking.status)).length },
    ];
  }

  const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
  const upcoming = bookings.filter((booking) => {
    if (!booking.slotStartsAt) return false;
    const time = new Date(booking.slotStartsAt).getTime();
    return time >= now && booking.status !== 'cancelled';
  });
  const nextThirtyDays = upcoming.filter((booking) => {
    if (!booking.slotStartsAt) return false;
    const time = new Date(booking.slotStartsAt).getTime();
    return time >= now && time <= thirtyDaysFromNow;
  }).length;

  if (scope === 'all') {
    return [
      { label: 'All bookings', value: bookings.length },
      { label: 'Upcoming', value: upcoming.length },
      { label: 'This month', value: thisMonth },
    ];
  }

  return [
    { label: 'Upcoming bookings', value: bookings.length },
    { label: 'Next 30 days', value: nextThirtyDays },
    { label: 'This month', value: thisMonth },
  ];
}
