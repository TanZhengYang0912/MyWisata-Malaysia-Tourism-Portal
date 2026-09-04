// P2 — Member 2: Check-in booking (B4)
// POST /api/vendors/[vendorId]/bookings/[bookingId]/checkin

import { apiOk, apiFail } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';
import { getBookingOrderItem } from '@/lib/vendor/booking-scope';
import { verifyTicketPassToken } from '@/lib/tickets/tokens';

interface Props { params: Promise<{ vendorId: string; bookingId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId, bookingId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;
  const outletIds = access.access.outletIds;

  let body: { passToken?: string; entriesAdmitted?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed for standard single-scan
  }

  if (body.passToken) {
    const verification = verifyTicketPassToken(body.passToken);
    if (!verification.valid) {
      return apiFail('INVALID_TOKEN', verification.error || 'Invalid ticket token', 401);
    }
    if (verification.claims?.bookingId !== bookingId) {
      return apiFail('TOKEN_MISMATCH', 'Ticket token does not match this booking', 400);
    }
  }

  // Get booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, order_items(vendor_id,outlet_id,quantity)')
    .eq('id', bookingId)
    .single();

  if (!booking) return apiFail('NOT_FOUND', 'Booking not found', 404);
  if (booking.status !== 'confirmed' && booking.status !== 'in_use') {
    return apiFail('INVALID_STATE', `Booking is ${booking.status}, cannot check in`, 400);
  }

  // Vendor-facing booking ownership comes from the order item.
  const { vendorId: bookingVendorId, outletId: bookingOutletId } = getBookingOrderItem(booking.order_items);
  if (bookingVendorId !== vendorId || !bookingOutletId || !outletIds.includes(bookingOutletId)) {
    return apiFail('FORBIDDEN', 'Booking is not at your outlet', 403);
  }

  // Retrieve or lazy-initialize ticket_pass
  let { data: pass } = await supabase
    .from('ticket_passes')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (!pass) {
    const rawQty = (booking.order_items as { quantity?: number } | null)?.quantity ?? 1;
    const initialLimit = Math.max(1, rawQty);
    const { data: createdPass, error: createPassErr } = await supabase
      .from('ticket_passes')
      .insert({
        booking_id: bookingId,
        order_item_id: booking.order_item_id,
        customer_id: booking.customer_id,
        policy: initialLimit > 1 ? 'group_entry' : 'single_entry',
        entry_limit: initialLimit,
        entries_used: 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (createPassErr || !createdPass) {
      return apiFail('DB_ERROR', createPassErr?.message || 'Could not initialize ticket pass', 500);
    }
    pass = createdPass;
  }

  // Determine requested admissions
  const remaining = pass.entry_limit - pass.entries_used;
  let entriesToAdmit = 1;
  if (typeof body.entriesAdmitted === 'number' && body.entriesAdmitted > 0) {
    entriesToAdmit = Math.floor(body.entriesAdmitted);
  } else if (pass.policy === 'group_entry') {
    // Default group admission: admit all remaining
    entriesToAdmit = Math.max(1, remaining);
  }

  // Atomic admission check and audit recording via RPC
  const { data: admissionResult, error: admissionError } = await supabase.rpc('admit_ticket_pass', {
    p_pass_id: pass.id,
    p_vendor_id: vendorId,
    p_outlet_id: bookingOutletId,
    p_operator_id: access.access.userId,
    p_entries_to_admit: entriesToAdmit,
    p_scan_token_id: body.passToken ?? null,
    p_metadata: { source: 'vendor_checkin_api' },
  });

  if (admissionError) {
    return apiFail('DB_ERROR', admissionError.message, 500);
  }

  const result = admissionResult as {
    success: boolean;
    code?: string;
    message?: string;
    pass_status?: string;
    entries_admitted?: number;
    entries_used?: number;
    entry_limit?: number;
    remaining?: number;
  };

  if (!result.success) {
    return apiFail(result.code || 'ADMISSION_FAILED', result.message || 'Check-in rejected', 400, result);
  }

  const now = new Date().toISOString();
  const isFullyRedeemed = result.pass_status === 'fully_redeemed';

  if (isFullyRedeemed) {
    void emitVendorNotification({
      eventKey: `booking:checkin:${bookingId}`,
      vendorId,
      outletId: bookingOutletId,
      audience: 'owner_and_assigned_outlet',
      category: 'vendor_bookings',
      type: 'vendor_booking_checkin',
      title: 'Booking checked in',
      body: `Booking ${bookingId} was fully checked in at your outlet.`,
      link: `/vendor/bookings/${bookingId}`,
      email: false,
      reference: bookingId,
      metadata: { status: 'checked_in', pass_status: result.pass_status ?? null },
      serviceDb: supabase,
    }).catch((notificationError) => console.error('[vendor-notifications] check-in event failed', notificationError));
  }

  return apiOk({
    id: bookingId,
    status: isFullyRedeemed ? 'checked_in' : 'in_use',
    check_in_at: now,
    pass: result,
  });
}
