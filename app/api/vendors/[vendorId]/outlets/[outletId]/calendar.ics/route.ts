import { createServiceClient } from '@/lib/supabase/service';
import { generateOutletIcalFeed } from '@/lib/integrations/ical-generator';

interface Props {
  params: Promise<{ vendorId: string; outletId: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const supabase = createServiceClient();

  // Load outlet
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name, vendor_id')
    .eq('id', outletId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (outletError || !outlet) {
    return new Response('Outlet not found', { status: 404 });
  }

  // Load upcoming and active slots
  const { data: slots, error: slotsError } = await supabase
    .from('booking_slots')
    .select('id, starts_at, ends_at, capacity, booked, status, products(name)')
    .eq('outlet_id', outletId)
    .order('starts_at', { ascending: true })
    .limit(200);

  if (slotsError) {
    return new Response('Unable to load calendar slots', { status: 500 });
  }

  const mappedSlots = (slots ?? []).map((s) => {
    const product = Array.isArray(s.products) ? s.products[0] : s.products;
    return {
      id: s.id,
      productName: product?.name || 'Activity Experience',
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      capacity: Number(s.capacity),
      booked: Number(s.booked),
      status: s.status,
      outletName: outlet.name,
    };
  });

  const icalContent = generateOutletIcalFeed(outlet.name, mappedSlots);

  return new Response(icalContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${outlet.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_calendar.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
