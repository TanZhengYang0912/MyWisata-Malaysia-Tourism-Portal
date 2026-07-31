export type CheckoutErrorPayload =
  | string
  | { code?: string; message?: string }
  | null
  | undefined;

export type CheckoutErrorCode =
  | "BOOKING_CAPACITY_UNAVAILABLE"
  | "BOOKING_SLOT_INVALID"
  | "INVENTORY_UNAVAILABLE"
  | "WALLET_INSUFFICIENT"
  | "VOUCHER_NOT_AVAILABLE"
  | "VOUCHER_NOT_STARTED"
  | "VOUCHER_EXPIRED"
  | "VOUCHER_LIMIT_REACHED"
  | "VOUCHER_MINIMUM_SPEND"
  | "VOUCHER_OUTLET_NOT_APPLICABLE"
  | "VOUCHER_PRODUCT_NOT_APPLICABLE"
  | "VOUCHER_CUSTOMER_LIMIT_REACHED"
  | "VOUCHER_DISCOUNT_MISMATCH"
  | "CHECKOUT_FAILED";

function payloadText(payload: CheckoutErrorPayload): string {
  if (typeof payload === "string") return payload;
  if (!payload) return "";
  return `${payload.code ?? ""} ${payload.message ?? ""}`.trim();
}
export function getCheckoutErrorCode(payload: CheckoutErrorPayload): CheckoutErrorCode {
  const text = payloadText(payload).toLowerCase();
  if (text.includes("booking_capacity_unavailable")) return "BOOKING_CAPACITY_UNAVAILABLE";
  if (text.includes("booking_slot_invalid")) return "BOOKING_SLOT_INVALID";
  if (text.includes("inventory_unavailable")) return "INVENTORY_UNAVAILABLE";
  if (text.includes("wallet_insufficient")) return "WALLET_INSUFFICIENT";
  if (text.includes("voucher_not_available")) return "VOUCHER_NOT_AVAILABLE";
  if (text.includes("voucher_not_started")) return "VOUCHER_NOT_STARTED";
  if (text.includes("voucher_expired")) return "VOUCHER_EXPIRED";
  if (text.includes("voucher_limit_reached")) return "VOUCHER_LIMIT_REACHED";
  if (text.includes("voucher_minimum_spend")) return "VOUCHER_MINIMUM_SPEND";
  if (text.includes("voucher_outlet_not_applicable")) return "VOUCHER_OUTLET_NOT_APPLICABLE";
  if (text.includes("voucher_product_not_applicable")) return "VOUCHER_PRODUCT_NOT_APPLICABLE";
  if (text.includes("voucher_customer_limit_reached")) return "VOUCHER_CUSTOMER_LIMIT_REACHED";
  if (text.includes("voucher_discount_mismatch")) return "VOUCHER_DISCOUNT_MISMATCH";
  return "CHECKOUT_FAILED";
}

export function getCheckoutErrorMessage(payload: CheckoutErrorPayload): string {
  switch (getCheckoutErrorCode(payload)) {
    case "BOOKING_CAPACITY_UNAVAILABLE":
      return "This time slot was just booked by another customer. Please choose another available slot.";
    case "BOOKING_SLOT_INVALID":
      return "This time slot is no longer valid. Please return to your cart and choose another slot.";
    case "INVENTORY_UNAVAILABLE":
      return "This item is no longer available in the requested quantity. Please return to your cart and adjust it.";
    case "WALLET_INSUFFICIENT":
      return "Wallet balance is no longer sufficient. Top up your Wallet or pay by card.";
    case "VOUCHER_NOT_AVAILABLE":
      return "This voucher is no longer available.";
    case "VOUCHER_NOT_STARTED":
      return "This voucher is not active yet.";
    case "VOUCHER_EXPIRED":
      return "This voucher has expired.";
    case "VOUCHER_LIMIT_REACHED":
      return "This voucher has reached its usage limit.";
    case "VOUCHER_MINIMUM_SPEND":
      return "Your order has not reached this voucher's minimum spend.";
    case "VOUCHER_OUTLET_NOT_APPLICABLE":
      return "This voucher is not valid for the selected outlet.";
    case "VOUCHER_PRODUCT_NOT_APPLICABLE":
      return "This voucher is not valid for the selected product.";
    case "VOUCHER_CUSTOMER_LIMIT_REACHED":
      return "You have reached this voucher's per-customer limit.";
    case "VOUCHER_DISCOUNT_MISMATCH":
      return "The voucher discount could not be verified. Please try again.";
    case "CHECKOUT_FAILED":
    default:
      return "We could not start checkout right now. Please try again.";
  }
}
