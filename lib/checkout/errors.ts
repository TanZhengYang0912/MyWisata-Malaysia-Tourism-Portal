export type CheckoutErrorPayload =
  | string
  | { code?: string; message?: string }
  | null
  | undefined;

export type CheckoutErrorCode =
  | "BOOKING_CAPACITY_UNAVAILABLE"
  | "BOOKING_SLOT_INVALID"
  | "INVENTORY_UNAVAILABLE"
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
    case "CHECKOUT_FAILED":
    default:
      return "We could not start checkout right now. Please try again.";
  }
}
