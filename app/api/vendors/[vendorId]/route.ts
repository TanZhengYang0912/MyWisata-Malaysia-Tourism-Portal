import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { vendorUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { auditAndNotify } from '@/lib/audit';

interface Props { params: Promise<{ vendorId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const { data, error } = await access.access.serviceDb.from('vendors').select('*').eq('id', vendorId).single();
  if (error || !data) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  return apiOk(data);
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, vendorUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.businessType !== undefined) updateData.business_type = body.businessType || null;
  if (body.logoUrl !== undefined) updateData.logo_url = body.logoUrl || null;
  if (body.coverUrl !== undefined) updateData.cover_url = body.coverUrl || null;
  if (body.slug !== undefined) updateData.slug = body.slug;
  if (!Object.keys(updateData).length) return apiFail('NO_CHANGES', 'No profile changes submitted', 422);

  const { data: before } = await access.access.serviceDb.from('vendors').select('name,slug,description,business_type,logo_url,cover_url').eq('id', vendorId).single();
  const { data, error } = await access.access.serviceDb.from('vendors').update(updateData).eq('id', vendorId).select('*').single();
  if (error) return apiFail('DB_ERROR', error.message, 400);
  await auditAndNotify({ action: 'vendor.profile_updated', entityType: 'vendor', entityId: vendorId, beforeData: before ?? undefined, afterData: updateData });
  return apiOk(data);
}
