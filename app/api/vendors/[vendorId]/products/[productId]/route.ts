// P2 — Member 2: Single product GET/PATCH/DELETE (B2)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { productUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; productId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      outlets(name, city),
      categories(name, slug),
      product_variants(*, inventory(*)),
      booking_slots(*)
    `)
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', access.access.outletIds)
    .single();

  if (error || !data) return apiFail('NOT_FOUND', 'Product not found', 404);
  return apiOk(data);
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const { data: existingProduct } = await access.access.serviceDb
    .from('products')
    .select('id,outlet_id')
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', access.access.outletIds)
    .maybeSingle();
  if (!existingProduct) return apiFail('NOT_FOUND', 'Product not found', 404);

  const parsed = await parseBody(request, productUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: Record<string, unknown> = {};
  const contentChanged = ['name', 'description', 'productType', 'requiresBooking', 'basePrice', 'categoryId', 'coverUrl', 'tags'].some((key) => body[key as keyof typeof body] !== undefined);
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.productType !== undefined) updateData.product_type = body.productType;
  if (body.requiresBooking !== undefined) updateData.requires_booking = body.requiresBooking;
  if (body.basePrice !== undefined) updateData.base_price = body.basePrice;
  if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
  if (body.coverUrl !== undefined) updateData.cover_url = body.coverUrl || null;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.status !== undefined) updateData.status = body.status;
  if (contentChanged) {
    updateData.review_status = 'pending_review';
    updateData.review_note = null;
    updateData.reviewed_by = null;
    updateData.reviewed_at = null;
    updateData.status = 'inactive';
  }

  const { data, error } = await access.access.serviceDb
    .from('products')
    .update(updateData)
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', access.access.outletIds)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  // Soft delete
  const { error } = await access.access.serviceDb
    .from('products')
    .update({ status: 'archived' })
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .in('outlet_id', access.access.outletIds);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: productId, status: 'archived' });
}
