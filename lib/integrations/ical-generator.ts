export interface IcalSlotEvent {
  id: string;
  productName: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  status: string;
  outletName?: string;
}

function formatIcalDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string for vendor outlet booking slots.
 * Compatible with external calendar systems (Airbnb, Google Calendar, Apple Calendar).
 */
export function generateOutletIcalFeed(outletName: string, slots: IcalSlotEvent[]): string {
  const nowStr = formatIcalDate(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyLawatan//Tourism Portal Booking Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:MyLawatan - ${outletName.replace(/[\r\n]/g, '')}`,
    'X-WR-TIMEZONE:Asia/Kuala_Lumpur',
  ];

  for (const slot of slots) {
    const startStr = formatIcalDate(slot.startsAt);
    const endStr = formatIcalDate(slot.endsAt);
    const remaining = Math.max(0, slot.capacity - slot.booked);
    const summary = `${slot.productName} (${slot.booked}/${slot.capacity} Booked)`;
    const description = `Status: ${slot.status}\\nBooked: ${slot.booked}\\nCapacity: ${slot.capacity}\\nRemaining: ${remaining}`;

    const slotUid = slot.id.startsWith('slot-') ? slot.id : `slot-${slot.id}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${slotUid}@mylawatan.my`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `STATUS:${slot.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
