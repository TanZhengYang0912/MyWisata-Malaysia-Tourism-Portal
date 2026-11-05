import { z } from "zod";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { verifyRetailPickupToken } from "@/lib/orders/retail-pickup-token";

interface Props { params: Promise<{ vendorId: string }> }
const schema = z.object({ retailToken: z.string().min(1).max(2048), outletId: databaseUuidSchema }).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const verification = verifyRetailPickupToken(parsed.data.retailToken);
  if (!verification.valid) return apiFail("INVALID_RETAIL_PICKUP", "This collection code is invalid", 400);
  const claims = verification.claims;
  if (claims.vendorId !== vendorId || claims.outletId !== parsed.data.outletId || !access.access.outletIds.includes(claims.outletId)) {
    return apiFail("FORBIDDEN", "This code is outside your assigned merchant or outlet", 403);
  }
  const service = access.access.serviceDb;
  const [{ data: vendor, error: vendorError }, { data: outlet, error: outletError }] = await Promise.all([
    service.from("vendors").select("status").eq("id", vendorId).maybeSingle(),
    service.from("outlets").select("status,vendor_id").eq("id", claims.outletId).maybeSingle(),
  ]);
  if (vendorError || outletError) return apiFail("DB_ERROR", "Unable to verify merchant access", 500);
  if (vendor?.status !== "approved" || outlet?.status !== "active" || outlet.vendor_id !== vendorId) {
    return apiFail("FORBIDDEN", "This outlet is not available for collection", 403);
  }

  const { data, error } = await service.rpc("fulfil_retail_pickup", {
    p_order_id: claims.orderId,
    p_order_item_id: claims.orderItemId,
    p_vendor_id: vendorId,
    p_outlet_id: claims.outletId,
    p_operator_id: access.access.userId,
  });
  if (error) {
    const code = error.message.includes("retail_pickup_already_fulfilled") ? "RETAIL_PICKUP_COLLECTED"
      : error.message.includes("retail_refund_active") ? "RETAIL_PICKUP_REFUND_PAUSED"
        : error.message.includes("retail_operator_forbidden") ? "FORBIDDEN"
          : error.message.includes("retail_order_not_paid") ? "ORDER_NOT_PAID"
            : error.message.includes("retail_pickup_not_found") ? "NOT_FOUND"
              : error.message.includes("retail_pickup_outlet_unavailable") || error.message.includes("retail_vendor_unavailable") ? "FORBIDDEN"
                : "RETAIL_PICKUP_FAILED";
    const message = code === "RETAIL_PICKUP_COLLECTED" ? "This item has already been collected"
      : code === "RETAIL_PICKUP_REFUND_PAUSED" ? "Collection is paused while this order is being reviewed"
        : code === "ORDER_NOT_PAID" ? "This order is not available for collection"
          : code === "FORBIDDEN" ? "This item is outside your available collection scope"
            : code === "NOT_FOUND" ? "This collection item is unavailable"
              : "Collection could not be completed. Refresh and try again.";
    const status = code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : code === "RETAIL_PICKUP_FAILED" ? 500 : 409;
    return apiFail(code, message, status);
  }
  return apiOk(data);
}
