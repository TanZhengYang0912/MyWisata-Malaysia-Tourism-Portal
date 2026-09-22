import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { z } from "zod";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { verifyFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";

interface Props { params: Promise<{ vendorId: string }> }

const fulfilSchema = z.object({
  foodToken: z.string().trim().min(1).max(2_000),
  outletId: databaseUuidSchema,
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, fulfilSchema);
  if (!parsed.ok) return parsed.response;
  if (!access.access.outletIds.includes(parsed.data.outletId)) return apiFail("FORBIDDEN", "This outlet is outside your assigned scope", 403);

  const verification = verifyFoodFulfilmentToken(parsed.data.foodToken);
  if (!verification.valid || verification.claims?.outletId !== parsed.data.outletId) return apiFail("INVALID_FOOD_ORDER", "This food order code is invalid for the selected outlet", 400);

  const { data: rows, error: rowsError } = await access.access.serviceDb.from("order_items")
    .select("id,food_fulfilment_mode,food_qr_scanned_at,fulfil_status,products(categories(slug))")
    .eq("order_id", verification.claims.orderId)
    .eq("vendor_id", vendorId)
    .eq("outlet_id", parsed.data.outletId);
  if (rowsError) return apiFail("DB_ERROR", rowsError.message, 500);
  const foodRows = (rows ?? []).filter((row: { fulfil_status: string; products: { categories: { slug: string } | { slug: string }[] | null } | { categories: { slug: string } | { slug: string }[] | null }[] | null }) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    return category?.slug === "food" && row.fulfil_status !== "cancelled";
  });
  if (!foodRows.length) return apiFail("FOOD_ORDER_NOT_FOUND", "No food items belong to this order at the selected outlet", 404);
  if (foodRows.some((row: { food_fulfilment_mode: string | null }) => !["dine_in", "takeaway"].includes(row.food_fulfilment_mode ?? ""))) {
    return apiFail("FOOD_ORDER_UNAVAILABLE", "This food order has no valid service mode", 409);
  }

  const { data, error } = await access.access.serviceDb.rpc("fulfil_food_order_group", {
    p_order_id: verification.claims.orderId,
    p_outlet_id: parsed.data.outletId,
    p_vendor_id: vendorId,
    p_operator_id: access.access.userId,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("food_order_not_paid")) return apiFail("ORDER_NOT_PAID", "This food order has not been paid", 409);
    if (message.includes("food_order_not_found")) return apiFail("FOOD_ORDER_NOT_FOUND", "No food items belong to this order at the selected outlet", 404);
    if (message.includes("food_order_already_fulfilled") || message.includes("food_order_fulfilment_conflict")) return apiFail("FOOD_ORDER_FULFILLED", "This food order has already been fulfilled", 409);
    if (message.includes("food_order_mode_inconsistent")) return apiFail("FOOD_ORDER_INCONSISTENT", "Food items at this outlet have different service modes", 409);
    return apiFail("DB_ERROR", "The food order could not be fulfilled", 500);
  }
  return apiOk(data);
}
