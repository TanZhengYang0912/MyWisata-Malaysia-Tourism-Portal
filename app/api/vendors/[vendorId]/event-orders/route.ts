import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getMalaysiaDateInputValue } from '@/lib/datetime/date-input';

interface Props { params: Promise<{ vendorId: string }> }

type Row = {
  id: string;
  order_id: string;
  event_location_id: string;
  promotion_campaign_locations: { id: string; name: string } | { id: string; name: string }[] | null;
  pickup_date: string;
  variant_name: string | null;
  product_name: string;
  quantity: number;
  line_total: number;
  fulfil_status: string;
  orders: { display_id: string; status: string } | { display_id: string; status: string }[] | null;
};

/** GET ?date=YYYY-MM-DD — paid event reservations to hand over; without a date, everything from today on. */
export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, undefined, { allowEventVendor: true });
  if (!access.ok) return access.response;

  const date = new URL(request.url).searchParams.get('date');
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiFail('VALIDATION_FAILED', 'Date must be YYYY-MM-DD', 422);

  let query = access.access.serviceDb
    .from('order_items')
    .select('id,order_id,event_location_id,promotion_campaign_locations(id,name),pickup_date,variant_name,product_name,quantity,line_total,fulfil_status,orders!inner(display_id,status)')
    .eq('vendor_id', vendorId)
    .not('event_location_id', 'is', null)
    .in('orders.status', ['paid', 'completed'])
    .order('pickup_date', { ascending: true })
    .order('slot_starts_at', { ascending: true })
    .limit(500);
  query = date ? query.eq('pickup_date', date) : query.gte('pickup_date', getMalaysiaDateInputValue());

  const { data, error } = await query;
  if (error) return apiFail('DB_ERROR', 'Reservations could not be loaded', 500);

  return apiOk({
    items: ((data ?? []) as Row[]).map((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const location = Array.isArray(row.promotion_campaign_locations) ? row.promotion_campaign_locations[0] : row.promotion_campaign_locations;
      return {
        id: row.id,
        orderId: row.order_id,
        displayId: order?.display_id ?? row.order_id.slice(0, 8).toUpperCase(),
        locationId: row.event_location_id,
        locationName: location?.name ?? 'Event location',
        pickupDate: row.pickup_date,
        pickupLabel: row.variant_name,
        itemName: row.product_name,
        quantity: row.quantity,
        lineTotal: Number(row.line_total),
        status: row.fulfil_status,
      };
    }),
  });
}
