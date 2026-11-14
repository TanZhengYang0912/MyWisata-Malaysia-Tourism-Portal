import { apiFail, apiOk, databaseUuidSchema, parseBody } from '@/lib/validation/schemas';
import { z } from 'zod';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { generateListingSuggestion } from '@/lib/ai/listing-suggestions';

interface Props { params: Promise<{ vendorId: string }> }

const suggestionSchema = z.object({
  name: z.string().trim().min(2).max(255),
  productType: z.string().trim().min(2).max(30),
  location: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  keywords: z.array(z.string().trim().max(50)).max(20).optional(),
  priceRange: z.string().trim().max(80).optional(),
  // The outlet this listing belongs to. Its name and location are read on the
  // server from the caller's authorized scope, never trusted from the client.
  outletId: databaseUuidSchema.optional(),
}).strict();

type OutletContextRow = { id: string; name: string | null; city: string | null; state: string | null };
type CategoryRow = { name: string | null };

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  // Product listings are managed by assigned outlet managers (see
  // authorizeVendorProductWrite), so the assistant must not be owner-only.
  // authorizeVendor still requires a signed-in owner or an outlet assignment
  // for this vendor, and the outlet check below keeps managers in scope.
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, suggestionSchema);
  if (!parsed.ok) return parsed.response;

  const { outletId: requestedOutletId, ...listing } = parsed.data;
  const scopedOutletIds = access.access.outletIds;
  if (requestedOutletId && !scopedOutletIds.includes(requestedOutletId)) {
    return apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403);
  }
  // A manager with a single outlet has an unambiguous context even before the form picks one.
  const outletId = requestedOutletId ?? (scopedOutletIds.length === 1 ? scopedOutletIds[0] : undefined);

  let outletName: string | undefined;
  let location = listing.location;
  if (outletId) {
    const { data: outlet, error: outletError } = await access.access.serviceDb
      .from('outlets')
      .select('id,name,city,state')
      .eq('id', outletId)
      .eq('vendor_id', vendorId)
      .maybeSingle();
    if (outletError) return apiFail('DB_ERROR', outletError.message, 500);
    if (!outlet) return apiFail('NOT_FOUND', 'Outlet not found in your assigned scope', 404);
    const row = outlet as OutletContextRow;
    outletName = row.name?.trim() || undefined;
    location = [row.city, row.state].filter(Boolean).join(', ') || undefined;
  }

  // Ground the category suggestion in the categories the catalogue actually offers.
  const { data: categoryRows, error: categoryError } = await access.access.serviceDb
    .from('categories')
    .select('name')
    .eq('is_active', true)
    .order('sort_order')
    .limit(60);
  if (categoryError) return apiFail('DB_ERROR', categoryError.message, 500);
  const allowedCategories = ((categoryRows ?? []) as CategoryRow[])
    .map((row) => row.name?.trim())
    .filter((name): name is string => Boolean(name));

  try {
    const result = await generateListingSuggestion({ ...listing, location, outletName, allowedCategories });
    if (!result.available) {
      const message = result.reason === 'rate_limited'
          ? 'The free AI provider is temporarily rate limited. Please try again later.'
          : result.reason === 'sensitive_input'
            ? 'Your listing details were not sent to AI because they may contain personal information. Remove phone, email, identity, bank, or private-address details and try again, or write the listing manually.'
          : 'AI suggestions are temporarily unavailable. You can write the listing manually or contact platform support if the problem continues.';
      const code = result.reason === 'authentication_failed' || result.reason === 'not_configured' ? 'AI_UNAVAILABLE' : `AI_${result.reason.toUpperCase()}`;
      return apiFail(code, message, result.reason === 'rate_limited' ? 429 : result.reason === 'sensitive_input' ? 422 : 503);
    }
    return apiOk(result);
  } catch (error) {
    console.error('[ai] listing suggestion failed', error instanceof Error ? error.message : error);
    return apiFail('AI_UNAVAILABLE', 'AI suggestions are temporarily unavailable.', 503);
  }
}
