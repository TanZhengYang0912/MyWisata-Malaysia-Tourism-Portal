import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProductReviewEligibility, getProductReviewsPage } from "@/backend/domains/catalogue";
import { cleanUserContent } from "@/lib/moderation/clean";
import { apiFail, apiOk, parseBody, productReviewSubmitSchema } from "@/lib/validation/schemas";

interface Props {
  params: Promise<{ productId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryInteger(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  return Number(value);
}

export async function GET(request: Request, { params }: Props) {
  const { productId } = await params;
  const query = new URL(request.url).searchParams;
  const page = queryInteger(query.get("page"), 1);
  const pageSize = queryInteger(query.get("pageSize"), 5);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10) {
    return apiFail("INVALID_QUERY", "page must be positive and pageSize must be between 1 and 10", 400);
  }
  const outletIdParam = query.get("outletId");
  if (outletIdParam && !UUID.test(outletIdParam)) {
    return apiFail("INVALID_QUERY", "outletId must be a valid UUID", 400);
  }

  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    const data = await getProductReviewsPage(productId, { page, pageSize, outletId: outletIdParam ?? undefined }, db);
    const viewer = user
      ? await getProductReviewEligibility(productId, user.id, { outletId: outletIdParam ?? undefined }, createServiceClient())
      : { state: "signed_out" as const, canReview: false, orderItemId: null };
    return apiOk({ ...data, viewer });
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not load reviews", 500);
  }
}

export async function POST(request: Request, { params }: Props) {
  const { productId } = await params;
  if (!UUID.test(productId)) return apiFail("INVALID_PRODUCT", "productId must be a valid UUID", 400);

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, productReviewSubmitSchema);
  if (!parsed.ok) return parsed.response;

  const cleanedTitle = parsed.data.title ? cleanUserContent(parsed.data.title) : null;
  const cleanedBody = parsed.data.body ? cleanUserContent(parsed.data.body) : null;
  if (cleanedTitle?.hadSlur || cleanedBody?.hadSlur) {
    return apiFail("CONTENT_REJECTED", "This review cannot be published", 422);
  }
  const title = cleanedTitle?.display.trim() || null;
  const body = cleanedBody?.display.trim() || null;

  try {
    const service = createServiceClient();
    const { data: orderItem, error: orderItemError } = await service
      .from("order_items")
      .select("id,vendor_id,outlet_id,product_id,orders!inner(user_id,status)")
      .eq("id", parsed.data.orderItemId)
      .eq("product_id", productId)
      .eq("orders.user_id", user.id)
      .in("orders.status", ["paid", "completed"])
      .maybeSingle();
    if (orderItemError) return apiFail("DB_ERROR", orderItemError.message, 500);
    if (!orderItem) return apiFail("NOT_ELIGIBLE", "Complete a purchase before reviewing this listing", 403);

    const { data: existingReview, error: existingReviewError } = await service
      .from("reviews")
      .select("id")
      .eq("order_item_id", parsed.data.orderItemId)
      .maybeSingle();
    if (existingReviewError) return apiFail("DB_ERROR", existingReviewError.message, 500);
    if (existingReview) return apiFail("ALREADY_REVIEWED", "This purchase has already been reviewed", 409);

    const { data, error } = await service
      .from("reviews")
      .insert({
        user_id: user.id,
        order_item_id: parsed.data.orderItemId,
        vendor_id: orderItem.vendor_id,
        outlet_id: orderItem.outlet_id,
        product_id: orderItem.product_id,
        rating: parsed.data.rating,
        title,
        body,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return apiFail("ALREADY_REVIEWED", "This purchase has already been reviewed", 409);
      return apiFail("DB_ERROR", error.message, 500);
    }
    return apiOk({ id: data.id }, { status: 201 });
  } catch (error) {
    return apiFail("DB_ERROR", error instanceof Error ? error.message : "Could not submit review", 500);
  }
}
