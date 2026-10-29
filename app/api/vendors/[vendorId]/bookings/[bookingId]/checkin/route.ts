import { authorizeVendor } from '@/lib/vendor-authorization';
import { checkInBooking } from '@/lib/vendor/booking-checkin';

interface Props { params: Promise<{ vendorId: string; bookingId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId, bookingId } = await params;
  const access = await authorizeVendor(vendorId, undefined, { requireApproved: true });
  if (!access.ok) return access.response;
  return checkInBooking(request, vendorId, bookingId, access.access);
}
