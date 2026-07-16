import { z } from "zod";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { authorizeOutlet } from "@/lib/vendor-authorization";
import {
  selectDraftDocument,
  selectPublicDocument,
} from "@/lib/vendor/outlet-page-persistence";
import { validateOutletPageDocument } from "@/lib/vendor/outlet-page-schema";

interface Props {
  params: Promise<{ vendorId: string; outletId: string }>;
}

const saveSchema = z
  .object({
    document: z.record(z.string(), z.unknown()),
    expectedDraftVersion: z.number().int().nonnegative().optional(),
  })
  .strict();

function pageResponse(row: Record<string, unknown> | null) {
  const source = row || {};
  const legacyBlocks = Array.isArray(source.blocks)
    ? source.blocks.length > 0
    : Boolean(source.blocks);
  return {
    draft: selectDraftDocument(source),
    published: selectPublicDocument(source),
    draftVersion: Number(source.draft_version || 0),
    publishedVersion: Number(source.published_version || 0),
    publishedAt:
      typeof source.published_at === "string" ? source.published_at : null,
    isPublished: Boolean(
      source.published_document ||
      source.published_at ||
      source.hero_url ||
      legacyBlocks,
    ),
  };
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const { data, error } = await access.access.serviceDb
    .from("outlet_pages")
    .select("*")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk(pageResponse(data as Record<string, unknown> | null));
}

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, saveSchema);
  if (!parsed.ok) return parsed.response;
  const validation = validateOutletPageDocument(parsed.data.document);
  if (!validation.success)
    return apiFail(
      "VALIDATION_FAILED",
      "Outlet page document is invalid",
      422,
      validation.error.flatten(),
    );

  const { data: existing, error: existingError } = await access.access.serviceDb
    .from("outlet_pages")
    .select("draft_version")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (existingError) return apiFail("DB_ERROR", existingError.message, 500);
  const currentVersion = Number(existing?.draft_version || 0);
  if (
    parsed.data.expectedDraftVersion !== undefined &&
    parsed.data.expectedDraftVersion !== currentVersion
  ) {
    return apiFail(
      "STALE_DRAFT",
      "This outlet page changed elsewhere. Reload before saving.",
      409,
      { currentVersion },
    );
  }

  const productIds = new Set<string>(validation.data.featuredIds);
  for (const block of validation.data.blocks)
    for (const id of block.productIds || []) productIds.add(id);
  if (productIds.size) {
    const { data: products, error: productError } =
      await access.access.serviceDb
        .from("products")
        .select("id")
        .eq("outlet_id", outletId)
        .in("id", [...productIds]);
    if (productError) return apiFail("DB_ERROR", productError.message, 500);
    if ((products || []).length !== productIds.size)
      return apiFail(
        "INVALID_PRODUCT_SCOPE",
        "Every selected product must belong to this outlet",
        422,
      );
  }

  const { data, error } = await access.access.serviceDb
    .from("outlet_pages")
    .upsert(
      {
        outlet_id: outletId,
        draft_document: validation.data,
        draft_version: currentVersion + 1,
      },
      { onConflict: "outlet_id" },
    )
    .select("*")
    .single();
  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk(pageResponse(data as Record<string, unknown>));
}

export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, outletId } = await params;
  const access = await authorizeOutlet(vendorId, outletId);
  if (!access.ok) return access.response;

  const { data: existing, error: existingError } = await access.access.serviceDb
    .from("outlet_pages")
    .select("*")
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (existingError) return apiFail("DB_ERROR", existingError.message, 500);
  if (!existing) return apiOk(pageResponse(null));

  const resetDocument = selectPublicDocument(existing as Record<string, unknown>);
  const { data, error } = await access.access.serviceDb
    .from("outlet_pages")
    .update({
      draft_document: resetDocument,
      draft_version: Number(existing.draft_version || 0) + 1,
    })
    .eq("outlet_id", outletId)
    .select("*")
    .single();
  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk(pageResponse(data as Record<string, unknown>));
}
