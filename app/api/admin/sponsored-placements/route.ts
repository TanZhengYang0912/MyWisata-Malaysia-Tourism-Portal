import { z } from "zod";

import { STATES_MY } from "@/lib/customer/malaysia-states";
import { requireStaffPermission } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const specificStates = STATES_MY.filter((state) => state !== "All Malaysia") as [string, ...string[]];

const placementCreateSchema = z.object({
  productId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  position: z.number().int().min(1).max(4),
  previewVersion: z.string().regex(/^[0-9a-f]{32}$/i),
  allStates: z.boolean(),
  state: z.enum(specificStates).optional(),
  allCategories: z.boolean(),
  categorySlug: z.enum(["food", "activity", "accommodation", "retail"]).optional(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  }
  if (value.allStates === Boolean(value.state)) {
    context.addIssue({ code: "custom", path: ["state"], message: "Choose all states or one state" });
  }
  if (value.allCategories === Boolean(value.categorySlug)) {
    context.addIssue({ code: "custom", path: ["categorySlug"], message: "Choose all categories or one category" });
  }
});

function mapPlacementError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("map_campaign_permission_required")) return apiFail("FORBIDDEN", "Sponsored placement permission required", 403);
  if (message.includes("sponsored_product_not_eligible")) return apiFail("PRODUCT_NOT_ELIGIBLE", "Product must be active and approved", 409);
  if (message.includes("sponsored_date_range_invalid")) return apiFail("INVALID_DATE_RANGE", "End must be after start", 422);
  if (message.includes("sponsored_preview_stale")) return apiFail("SPONSORED_PREVIEW_STALE", "Campaign impact changed. Review the latest impact before continuing", 409);
  return apiFail("SPONSORED_PLACEMENT_ERROR", "Sponsored placement could not be saved", 500);
}

export async function GET() {
  const { db, response } = await requireStaffPermission("admin.map_campaign.manage");
  if (response) return response;

  const [placementsResult, productsResult] = await Promise.all([
    db
      .from("sponsored_discovery_placements")
      .select("id,product_id,state,category_slug,starts_at,ends_at,priority,status,created_by,approved_by,approved_at,review_note,created_at,updated_at,products(id,name,status,review_status)")
      .order("created_at", { ascending: false }),
    db
      .from("products")
      .select("id,name")
      .eq("status", "active")
      .eq("review_status", "approved")
      .order("name", { ascending: true }),
  ]);

  if (placementsResult.error || productsResult.error) {
    return apiFail("SPONSORED_PLACEMENTS_UNAVAILABLE", "Unable to load sponsored placements", 503);
  }

  const allPlacements = placementsResult.data ?? [];
  return apiOk({
    placements: allPlacements.filter((placement) => placement.status !== "archived"),
    archivedPlacements: allPlacements.filter((placement) => placement.status === "archived"),
    products: productsResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const { db, user, response } = await requireStaffPermission("admin.map_campaign.manage");
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, placementCreateSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await db.rpc("create_sponsored_discovery_placement", {
    p_product_id: parsed.data.productId,
    p_state: parsed.data.allStates ? null : parsed.data.state ?? null,
    p_category_slug: parsed.data.allCategories ? null : parsed.data.categorySlug ?? null,
    p_starts_at: parsed.data.startsAt,
    p_ends_at: parsed.data.endsAt,
    p_priority: parsed.data.position,
    p_preview_version: parsed.data.previewVersion,
  });

  if (error) return mapPlacementError(error);
  if (!data) return apiFail("SPONSORED_PLACEMENT_ERROR", "Sponsored placement returned no result", 500);
  return apiOk({ placement: data }, { status: 201 });
}
