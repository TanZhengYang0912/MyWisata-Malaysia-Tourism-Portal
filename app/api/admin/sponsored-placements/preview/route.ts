import { z } from "zod";

import { STATES_MY } from "@/lib/customer/malaysia-states";
import { sponsoredImpactPreviewSchema } from "@/lib/sponsored-placements/impact";
import { requireStaffPermission } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";

const specificStates = STATES_MY.filter((state) => state !== "All Malaysia") as [string, ...string[]];
const categorySchema = z.enum(["food", "activity", "accommodation", "retail"]);

const createPreviewSchema = z.object({
  mode: z.literal("create"),
  productId: databaseUuidSchema,
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  position: z.number().int().min(1).max(4),
  allStates: z.boolean(),
  state: z.enum(specificStates).optional(),
  allCategories: z.boolean(),
  categorySlug: categorySchema.optional(),
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

const approvePreviewSchema = z.object({
  mode: z.literal("approve"),
  placementId: databaseUuidSchema,
}).strict();

const previewRequestSchema = z.discriminatedUnion("mode", [
  createPreviewSchema,
  approvePreviewSchema,
]);

function mapPreviewError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("map_campaign_permission_required")) return apiFail("FORBIDDEN", "Sponsored placement permission required", 403);
  if (message.includes("sponsored_product_not_eligible")) return apiFail("PRODUCT_NOT_ELIGIBLE", "Product must be active and approved", 409);
  if (message.includes("sponsored_placement_not_found")) return apiFail("NOT_FOUND", "Sponsored placement not found", 404);
  if (message.includes("sponsored_transition_invalid")) return apiFail("INVALID_STATE", "Campaign is not awaiting approval", 409);
  if (message.includes("sponsored_priority_invalid")) return apiFail("INVALID_POSITION", "Position must be between 1 and 4", 422);
  if (message.includes("sponsored_date_range_invalid")) return apiFail("INVALID_DATE_RANGE", "End must be after start", 422);
  if (message.includes("sponsored_state_invalid")) return apiFail("INVALID_STATE_SCOPE", "Choose a supported Malaysia state", 422);
  if (message.includes("sponsored_category_invalid")) return apiFail("INVALID_CATEGORY_SCOPE", "Choose a supported category", 422);
  return apiFail("SPONSORED_PREVIEW_ERROR", "Unable to calculate campaign impact", 500);
}

export async function POST(request: Request) {
  const { db, user, response } = await requireStaffPermission("admin.map_campaign.manage");
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, previewRequestSchema);
  if (!parsed.ok) return parsed.response;

  const rpcArguments = parsed.data.mode === "create"
    ? {
        p_placement_id: null,
        p_product_id: parsed.data.productId,
        p_state: parsed.data.allStates ? null : parsed.data.state ?? null,
        p_category_slug: parsed.data.allCategories ? null : parsed.data.categorySlug ?? null,
        p_starts_at: parsed.data.startsAt,
        p_ends_at: parsed.data.endsAt,
        p_priority: parsed.data.position,
      }
    : {
        p_placement_id: parsed.data.placementId,
        p_product_id: null,
        p_state: null,
        p_category_slug: null,
        p_starts_at: null,
        p_ends_at: null,
        p_priority: null,
      };
  const { data, error } = await db.rpc("preview_sponsored_discovery_placement", rpcArguments);

  if (error) return mapPreviewError(error);
  const safePreview = sponsoredImpactPreviewSchema.safeParse(data);
  if (!safePreview.success) {
    return apiFail("SPONSORED_PREVIEW_ERROR", "Unable to calculate campaign impact", 500);
  }
  return apiOk({ preview: safePreview.data });
}
