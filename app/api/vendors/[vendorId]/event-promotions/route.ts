import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { eventPromotionSubmitSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { getMyEventPromotions, submitEventPromotion } from '@/lib/vendor/event-promotions';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const promotions = await getMyEventPromotions(access.access.serviceDb, vendorId);
  return apiOk({ promotions });
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const { data: vendor, error: vendorError } = await access.access.serviceDb
    .from('vendors')
    .select('status')
    .eq('id', vendorId)
    .maybeSingle();
  if (vendorError) return apiFail('DB_ERROR', vendorError.message, 500);
  if (!vendor || vendor.status !== 'approved') {
    return apiFail('INVALID_STATE', 'Vendor is not approved', 403);
  }

  const parsed = await parseBody(request, eventPromotionSubmitSchema);
  if (!parsed.ok) return parsed.response;

  // A failed insert must come back as the API's JSON error shape; an uncaught
  // throw returns an HTML 500 the form cannot read.
  try {
    const promotion = await submitEventPromotion(access.access.serviceDb, vendorId, access.access.userId, parsed.data);
    return apiOk({ promotion }, { status: 201 });
  } catch (error) {
    return apiFail('DB_ERROR', error instanceof Error ? error.message : 'Failed to submit event promotion', 500);
  }
}
