// P2 — Member 2: Single product GET/PATCH/DELETE (B2)

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { productUpdateSchema } from '@/lib/validation/vendor-schemas';
import { createServiceClient } from '@/lib/supabase/service';

interface Props { params: Promise<{ vendorId: string; productId: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { productId } = await params;
  const supabase = await createClient();

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
    .single();

  if (error || !data) return apiFail('NOT_FOUND', 'Product not found', 404);
  return apiOk(data);
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const authDb = await createClient() as any;

  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await authDb
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  const parsed = await parseBody(request, productUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.productType !== undefined) updateData.product_type = body.productType;
  if (body.requiresBooking !== undefined) updateData.requires_booking = body.requiresBooking;
  if (body.basePrice !== undefined) updateData.base_price = body.basePrice;
  if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
  if (body.coverUrl !== undefined) updateData.cover_url = body.coverUrl || null;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.status !== undefined) updateData.status = body.status;

  const { data, error } = await createServiceClient()
    .from('products')
    .update(updateData)
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const authDb = await createClient() as any;

  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: vendor } = await authDb
    .from('vendors')
    .select('owner_id')
    .eq('id', vendorId)
    .single();
  if (!vendor || vendor.owner_id !== user.id) return apiFail('FORBIDDEN', 'Not your vendor', 403);

  // Soft delete
  const { error } = await createServiceClient()
    .from('products')
    .update({ status: 'archived' })
    .eq('id', productId)
    .eq('vendor_id', vendorId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: productId, status: 'archived' });
}
