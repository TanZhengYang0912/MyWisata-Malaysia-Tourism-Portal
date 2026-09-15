import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { toCustomerCalendarEvents, type CustomerCalendarRecord } from "@/lib/customer/event-calendar";
import { productImageUrl } from "@/lib/storage/product-image";

const MAX_RANGE_DAYS = 92;

function parseRangeValue(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const from = parseRangeValue(url.searchParams.get("from"), now);
  const fallbackTo = new Date(from.getTime() + 31 * 24 * 60 * 60 * 1000);
  const requestedTo = parseRangeValue(url.searchParams.get("to"), fallbackTo);
  const to = new Date(Math.min(requestedTo.getTime(), from.getTime() + MAX_RANGE_DAYS * 24 * 60 * 60 * 1000));
  if (to <= from) return apiFail("INVALID_RANGE", "Calendar end must be after its start.", 400);

  const db = await createClient();
  const { data, error } = await db
    .from("booking_slots")
    .select("id,product_id,outlet_id,starts_at,ends_at,capacity,booked,status,products!inner(id,name,cover_url,requires_booking,status,review_status),outlets!inner(id,name,operating_hours,status,review_status,vendors!inner(name,status))")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .eq("products.status", "active")
    .eq("products.review_status", "approved")
    .eq("outlets.status", "active")
    .eq("outlets.review_status", "approved")
    .eq("outlets.vendors.status", "approved")
    .order("starts_at", { ascending: true });
  if (error) return apiFail("DB_ERROR", error.message, 500);

  const records = (data ?? []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
    const vendor = outlet?.vendors
      ? (Array.isArray(outlet.vendors) ? outlet.vendors[0] : outlet.vendors)
      : null;
    return {
      id: row.id,
      activityId: row.product_id,
      activityName: product?.name ?? "",
      image: productImageUrl(product?.cover_url ?? null),
      outletId: row.outlet_id,
      outletName: outlet?.name ?? "",
      vendorName: vendor?.name ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: Number(row.capacity),
      booked: Number(row.booked),
      status: row.status,
      requiresBooking: product?.requires_booking ?? true,
      operatingHours: (outlet?.operating_hours ?? null) as CustomerCalendarRecord["operatingHours"],
    } satisfies CustomerCalendarRecord;
  });

  return apiOk({ events: toCustomerCalendarEvents(records, now), range: { from: from.toISOString(), to: to.toISOString() } });
}
