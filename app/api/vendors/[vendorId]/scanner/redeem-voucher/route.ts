import { z } from "zod";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { verifyVoucherStoreToken, voucherTokenFingerprint } from "@/lib/vouchers/store-token";

interface Props { params: Promise<{ vendorId: string }> }

const redeemSchema = z.object({
  token: z.string().trim().min(1).max(4_000),
  outletId: databaseUuidSchema,
}).strict();

function errorResponse(message: string) {
  const code = message.match(/store_redemption_[a-z_]+/)?.[0] ?? "REDEMPTION_FAILED";
  const conflictCodes = new Set(["store_redemption_claim_already_redeemed", "store_redemption_claim_unavailable", "store_redemption_expired", "store_redemption_limit_reached"]);
  return apiFail(code.toUpperCase(), "This voucher can no longer be redeemed", conflictCodes.has(code) ? 409 : 400);
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, redeemSchema);
  if (!parsed.ok) return parsed.response;
  if (!access.access.outletIds.includes(parsed.data.outletId)) return apiFail("FORBIDDEN", "This outlet is outside your assigned scope", 403);

  const verification = verifyVoucherStoreToken(parsed.data.token);
  if (!verification.valid || !verification.payload) return apiFail("INVALID_CODE", "This voucher code is invalid or expired", 400);
  if (verification.payload.outletId && verification.payload.outletId !== parsed.data.outletId) return apiFail("FORBIDDEN", "This voucher is not valid at the selected outlet", 403);

  const { data, error } = await access.access.serviceDb.rpc("redeem_store_voucher", {
    p_claim_id: verification.payload.claimId,
    p_voucher_id: verification.payload.voucherId,
    p_vendor_id: vendorId,
    p_outlet_id: parsed.data.outletId,
    p_redeemed_by: access.access.userId,
    p_token_fingerprint: voucherTokenFingerprint(parsed.data.token),
  });
  if (error) return errorResponse(error.message);
  return apiOk({ redemption: data });
}
