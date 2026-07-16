import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeOutlet } from '@/lib/vendor-authorization';
import { selectDraftDocument, selectPublicDocument } from '@/lib/vendor/outlet-page-persistence';
import { validateOutletPageDocument } from '@/lib/vendor/outlet-page-schema';

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

const publishSchema = z.object({
  expectedDraftVersion: z.number().int().nonnegative().optional(),
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, publishSchema);
  if (!parsed.ok) return parsed.response;

  const { data: existing, error: existingError } = await access.access.serviceDb
    .from('outlet_pages')
    .select('*')
    .eq('outlet_id', outletId)
    .maybeSingle();
  if (existingError) return apiFail('DB_ERROR', existingError.message, 500);
  if (!existing) return apiFail('INVALID_STATE', 'Save a draft before publishing this outlet page', 409);

  const currentVersion = Number(existing.draft_version || 0);
  if (parsed.data.expectedDraftVersion !== undefined && parsed.data.expectedDraftVersion !== currentVersion) {
    return apiFail('STALE_DRAFT', 'This outlet page changed elsewhere. Reload before publishing.', 409, { currentVersion });
  }

  const document = selectDraftDocument(existing);
  const validation = validateOutletPageDocument(document);
  if (!validation.success) return apiFail('VALIDATION_FAILED', 'Outlet page document is invalid', 422, validation.error.flatten());
  if (!validation.data.blocks.length) return apiFail('INVALID_STATE', 'Add at least one section before publishing', 422);

  const { data, error } = await access.access.serviceDb.from('outlet_pages').update({
    published_document: validation.data,
    published_version: Number(existing.published_version || 0) + 1,
    published_at: new Date().toISOString(),
    last_published_by: access.access.userId,
  }).eq('outlet_id', outletId).select('*').single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({
    published: selectPublicDocument(data),
    draft: selectDraftDocument(data),
    draftVersion: Number(data.draft_version || 0),
    publishedVersion: Number(data.published_version || 0),
    publishedAt: data.published_at,
    isPublished: true,
  });
}
