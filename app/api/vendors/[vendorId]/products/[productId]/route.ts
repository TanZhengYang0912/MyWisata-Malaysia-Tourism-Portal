// P2 — Member 2: Single product GET/PATCH/DELETE (B2)

import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { productUpdateSchema } from '@/lib/validation/vendor-schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getScopedProduct } from '@/lib/vendor/product-scope';
import {
  DEFAULT_PRODUCT_TICKET_ADMISSION,
  isDefaultProductTicketAdmission,
  isMissingProductTicketAdmissionSchemaError,
  resolveProductTicketAdmission,
  type TicketEntryPolicy,
} from '@/lib/tickets/product-ticket-policy';

interface Props { params: Promise<{ vendorId: string; productId: string }> }
type StockVariant = { is_active: boolean; inventory?: { quantity?: number | null; reserved?: number | null }[] };

async function refreshStockStatus(serviceDb: SupabaseClient, vendorId: string, productId: string) {
  const { data: product } = await serviceDb.from('products').select('requires_booking,review_status,status').eq('id', productId).eq('vendor_id', vendorId).maybeSingle();
  if (!product || product.requires_booking) return;
  const { data: variants } = await serviceDb.from('product_variants').select('is_active,inventory(quantity,reserved)').eq('product_id', productId);
  const available = ((variants || []) as StockVariant[]).some((variant) => variant.is_active && Number(variant.inventory?.[0]?.quantity || 0) - Number(variant.inventory?.[0]?.reserved || 0) > 0);
  await serviceDb.from('products').update({ status: available && product.review_status === 'approved' ? 'active' : 'inactive' }).eq('id', productId).eq('vendor_id', vendorId).neq('status', 'archived');
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const supabase = access.access.serviceDb;

  const { data, error } = await getScopedProduct(supabase, vendorId, productId, access.access.outletIds, `
    *,
    outlets(name, city),
    categories(name, slug),
    product_variants(*, inventory(*)),
    media_assets(id,url,alt_text,sort_order),
    booking_slots(*)
  `);

  if (error || !data) return apiFail('NOT_FOUND', 'Product not found', 404);
  return apiOk(data);
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const scopedTicketProduct = await getScopedProduct<{
    id: string;
    outlet_id: string | null;
    requires_booking: boolean;
    ticket_entry_policy: TicketEntryPolicy | null;
    ticket_entry_limit: number | null;
    ticket_validity_days: number | null;
  }>(
    access.access.serviceDb,
    vendorId,
    productId,
    access.access.outletIds,
    'id,outlet_id,requires_booking,ticket_entry_policy,ticket_entry_limit,ticket_validity_days',
  );
  let existingProduct = scopedTicketProduct.data;
  let productOutlet = scopedTicketProduct.outlet;
  let isLegacyTicketSchema = false;
  if (!existingProduct && isMissingProductTicketAdmissionSchemaError(scopedTicketProduct.error)) {
    const legacyProduct = await getScopedProduct<{
      id: string;
      outlet_id: string | null;
      requires_booking: boolean;
    }>(
      access.access.serviceDb,
      vendorId,
      productId,
      access.access.outletIds,
      'id,outlet_id,requires_booking',
    );
    existingProduct = legacyProduct.data
      ? {
          ...legacyProduct.data,
          ticket_entry_limit: DEFAULT_PRODUCT_TICKET_ADMISSION.ticketEntryLimit,
          ticket_entry_policy: DEFAULT_PRODUCT_TICKET_ADMISSION.ticketEntryPolicy,
          ticket_validity_days: DEFAULT_PRODUCT_TICKET_ADMISSION.ticketValidityDays,
        }
      : null;
    productOutlet = legacyProduct.outlet;
    isLegacyTicketSchema = true;
  }
  if (!existingProduct || !productOutlet) return apiFail('NOT_FOUND', 'Product not found in an assigned outlet', 404);

  const parsed = await parseBody(request, productUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ticketAdmission = resolveProductTicketAdmission({
    requiresBooking: body.requiresBooking ?? existingProduct.requires_booking,
    ticketEntryPolicy: body.ticketEntryPolicy ?? existingProduct.ticket_entry_policy,
    ticketEntryLimit: body.ticketEntryLimit ?? existingProduct.ticket_entry_limit,
    ticketValidityDays: body.ticketValidityDays ?? existingProduct.ticket_validity_days,
  });
  if (!ticketAdmission.ok) return apiFail('INVALID_TICKET_ADMISSION', ticketAdmission.message, 400);

  const updateData: Record<string, unknown> = {};
  const ticketAdmissionChanged = ['requiresBooking', 'ticketEntryPolicy', 'ticketEntryLimit', 'ticketValidityDays'].some((key) => body[key as keyof typeof body] !== undefined);
  const contentChanged = ['name', 'description', 'productType', 'requiresBooking', 'ticketEntryPolicy', 'ticketEntryLimit', 'ticketValidityDays', 'basePrice', 'categoryId', 'coverUrl', 'tags', 'defaultCapacity', 'digitalAssetUrl', 'digitalAssetName', 'digitalAssetType', 'digitalAssetSize'].some((key) => body[key as keyof typeof body] !== undefined);
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.productType !== undefined) updateData.product_type = body.productType;
  if (body.requiresBooking !== undefined) updateData.requires_booking = body.requiresBooking;
  if (ticketAdmissionChanged) {
    if (isLegacyTicketSchema && !isDefaultProductTicketAdmission(ticketAdmission.value)) {
      return apiFail(
        'TICKET_ADMISSION_SCHEMA_REQUIRED',
        'Multi-entry ticket settings are unavailable until this workspace is updated.',
        409,
      );
    }
    if (!isLegacyTicketSchema) {
      updateData.ticket_entry_policy = ticketAdmission.value.ticketEntryPolicy;
      updateData.ticket_entry_limit = ticketAdmission.value.ticketEntryLimit;
      updateData.ticket_validity_days = ticketAdmission.value.ticketValidityDays;
    }
  }
  if (body.basePrice !== undefined) updateData.base_price = body.basePrice;
  if (body.categoryId !== undefined) updateData.category_id = body.categoryId;
  if (body.coverUrl !== undefined) updateData.cover_url = body.coverUrl || null;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.defaultCapacity !== undefined) updateData.default_capacity = body.defaultCapacity;
  if (body.digitalAssetUrl !== undefined) updateData.digital_asset_url = body.digitalAssetUrl || null;
  if (body.digitalAssetName !== undefined) updateData.digital_asset_name = body.digitalAssetName || null;
  if (body.digitalAssetType !== undefined) updateData.digital_asset_type = body.digitalAssetType || null;
  if (body.digitalAssetSize !== undefined) updateData.digital_asset_size = body.digitalAssetSize ?? null;
  if (contentChanged) {
    updateData.review_status = body.submissionMode === 'draft' ? 'draft' : 'pending_review';
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
    .select()
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);

  if (body.gallery?.length) {
    const { data: existingMedia } = await access.access.serviceDb
      .from('media_assets')
      .select('url')
      .eq('product_id', productId);
    const existingUrls = new Set((existingMedia || []).map((media: { url: string }) => media.url));
    const newMedia = body.gallery
      .filter((media) => !existingUrls.has(media.url))
      .map((media, index) => ({
        vendor_id: vendorId,
        outlet_id: existingProduct.outlet_id,
        product_id: productId,
        url: media.url,
        alt_text: media.alt || String(body.name || 'Product image'),
        media_type: 'image',
        sort_order: (existingMedia?.length || 0) + index,
      }));
    if (newMedia.length) {
      const { error: mediaError } = await access.access.serviceDb.from('media_assets').insert(newMedia);
      if (mediaError) return apiFail('DB_ERROR', mediaError.message, 500);
    }
  }

  if (body.availableStock !== undefined || body.lowStockThreshold !== undefined) {
    const { data: variant } = await access.access.serviceDb
      .from('product_variants')
      .select('id')
      .eq('product_id', productId)
      .eq('is_default', true)
      .maybeSingle();
    if (variant && body.productType !== 'digital' && body.requiresBooking !== true) {
      const { error: inventoryError } = await access.access.serviceDb
        .from('inventory')
        .upsert({
          variant_id: variant.id,
          outlet_id: productOutlet.id,
          quantity: body.availableStock ?? 0,
          low_stock_threshold: body.lowStockThreshold ?? 5,
        }, { onConflict: 'variant_id,outlet_id' });
      if (inventoryError) return apiFail('DB_ERROR', inventoryError.message, 500);
      await refreshStockStatus(access.access.serviceDb, vendorId, productId);
    }
  }

  return apiOk(data);
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, productId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const { data: existingProduct } = await getScopedProduct<{ id: string }>(
    access.access.serviceDb,
    vendorId,
    productId,
    access.access.outletIds,
    'id',
  );
  if (!existingProduct) return apiFail('NOT_FOUND', 'Product not found', 404);

  // Soft delete
  const { error } = await access.access.serviceDb
    .from('products')
    .update({ status: 'archived' })
    .eq('id', productId)
    .eq('vendor_id', vendorId);

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: productId, status: 'archived' });
}
