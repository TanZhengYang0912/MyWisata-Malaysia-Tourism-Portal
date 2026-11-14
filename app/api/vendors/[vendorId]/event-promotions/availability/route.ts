import { z } from 'zod';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getEventPromotionDateAvailability } from '@/lib/vendor/event-promotions';
import { getEventPromotionCostPerDaySen } from '@/lib/admin/event-promotions';

interface Props { params: Promise<{ vendorId: string }> }

const querySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
}).refine((q) => q.to >= q.from, { message: 'to must be on or after from' });

// Soft UX hint for the vendor submission calendar — the real capacity gate
// is server-side in review_vendor_event_promotion's approve branch. Any
// authorized vendor user can read this; it exposes aggregate counts only.
export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ from: url.searchParams.get('from'), to: url.searchParams.get('to') });
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid from/to date range', 422, parsed.error.flatten());

  const from = new Date(`${parsed.data.from}T00:00:00Z`);
  const to = new Date(`${parsed.data.to}T00:00:00Z`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days > 180) return apiFail('VALIDATION_FAILED', 'Date range may not exceed 180 days', 422);

  const [availability, costPerDaySen] = await Promise.all([
    getEventPromotionDateAvailability(access.access.authDb, parsed.data.from, parsed.data.to),
    getEventPromotionCostPerDaySen(access.access.serviceDb),
  ]);
  return apiOk({ availability, costPerDaySen });
}
