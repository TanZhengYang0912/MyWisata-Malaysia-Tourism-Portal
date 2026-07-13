import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeOutlet } from '@/lib/vendor-authorization';

interface Props { params: Promise<{ vendorId: string; outletId: string }> }

const pageSchema = z.object({
  heroUrl: z.string().url().max(2000).optional().or(z.literal('')),
  brandColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().trim().min(2).max(120).optional(),
  featuredIds: z.array(z.string().uuid()).max(12).optional(),
  seoTitle: z.string().trim().max(255).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  blocks: z.array(z.record(z.string(), z.unknown())).max(30).optional(),
  gallery: z.array(z.object({ url: z.string().url().max(2000), alt: z.string().max(255).optional() }).strict()).max(50).optional(),
}).strict();

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const { data, error } = await access.access.serviceDb.from('outlet_pages').select('*').eq('outlet_id', outletId).maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data || { outlet_id: outletId, blocks: [], gallery: [] });
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, pageSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const updateData: Record<string, unknown> = { outlet_id: outletId };
  if (body.heroUrl !== undefined) updateData.hero_url = body.heroUrl || null;
  if (body.brandColour !== undefined) updateData.brand_colour = body.brandColour;
  if (body.fontFamily !== undefined) updateData.font_family = body.fontFamily;
  if (body.featuredIds !== undefined) updateData.featured_ids = body.featuredIds;
  if (body.seoTitle !== undefined) updateData.seo_title = body.seoTitle || null;
  if (body.seoDescription !== undefined) updateData.seo_description = body.seoDescription || null;
  if (body.blocks !== undefined) updateData.blocks = body.blocks;
  if (body.gallery !== undefined) updateData.gallery = body.gallery;

  const { data, error } = await access.access.serviceDb.from('outlet_pages').upsert(updateData, { onConflict: 'outlet_id' }).select().single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data);
}
