export type CheckoutErrorPayload =
  | string
  | { code?: string; message?: string; activeOrderId?: string; details?: unknown }
  | null
  | undefined;

export type CheckoutErrorCode =
  | "CONTACT_EMAIL_REQUIRED"
  | "CONTACT_EMAIL_INVALID"
  | "CONTACT_PHONE_REQUIRED"
  | "CONTACT_PHONE_INVALID"
  | "CONTACT_NAME_INVALID"
  | "PAYMENT_SERVICE_UNAVAILABLE"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "PAYMENT_STATUS_UNCERTAIN"
  | "CHECKOUT_SERVICE_UNAVAILABLE"
  | "CHECKOUT_DETAILS_INVALID"
  | "CHECKOUT_CONNECTION_FAILED"
  | "CHECKOUT_RATE_LIMITED"
  | "GUEST_SESSION_UNAVAILABLE"
  | "CHECKOUT_CLOSED"
  | "CART_EMPTY"
  | "CART_SELECTION_REQUIRED"
  | "STAY_DETAILS_REQUIRED"
  | "FOOD_SERVICE_MODE_REQUIRED"
  | "FOOD_SERVICE_MODE_UNAVAILABLE"
  | "WALLET_RESERVATION_UNAVAILABLE"
  | "BOOKING_CAPACITY_UNAVAILABLE"
  | "BOOKING_SLOT_INVALID"
  | "CART_ITEM_UNAVAILABLE"
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
  | "VOUCHER_CLAIM_UNAVAILABLE"
  | "VOUCHER_CLAIM_EXPIRED"
  | "VOUCHER_CLAIM_MISMATCH"
  | "NEW_ORDERS_PAUSED"
  | "ACTIVE_CHECKOUT_EXISTS"
  | "CHECKOUT_COMMITMENT_UNAVAILABLE"
  | "CHECKOUT_FAILED";

function payloadText(payload: CheckoutErrorPayload): string {
  if (typeof payload === "string") return payload;
  if (!payload) return "";
  return `${payload.code ?? ""} ${payload.message ?? ""}`.trim();
}

const contactErrorCodes = ["CONTACT_EMAIL_REQUIRED", "CONTACT_EMAIL_INVALID", "CONTACT_PHONE_INVALID", "CONTACT_NAME_INVALID"] as const;
const errorAliases: Record<string, CheckoutErrorCode> = {
  CONTACT_REQUIRED: "CONTACT_EMAIL_REQUIRED",
  TOYYIBPAY_EMAIL_REQUIRED: "CONTACT_EMAIL_REQUIRED",
  TOYYIBPAY_PHONE_REQUIRED: "CONTACT_PHONE_REQUIRED",
  PAYMENT_PROVIDER_MISMATCH: "PAYMENT_METHOD_UNAVAILABLE",
  PAYMENT_SIMULATOR_UNAVAILABLE: "PAYMENT_SERVICE_UNAVAILABLE",
  PAYMENT_SIMULATOR_PREPARE_FAILED: "PAYMENT_SERVICE_UNAVAILABLE",
  TOYYIBPAY_UNAVAILABLE: "PAYMENT_SERVICE_UNAVAILABLE",
  // A failed provider request may still have created a bill before its response was lost.
  TOYYIBPAY_PREPARE_FAILED: "PAYMENT_STATUS_UNCERTAIN",
  PAYMENT_APP_URL_INVALID: "PAYMENT_SERVICE_UNAVAILABLE",
  TOYYIBPAY_CREATE_INDETERMINATE: "PAYMENT_STATUS_UNCERTAIN",
  TOYYIBPAY_PREPARE_CONFLICT: "PAYMENT_STATUS_UNCERTAIN",
  PAYMENT_SESSION_PERSIST_FAILED: "PAYMENT_STATUS_UNCERTAIN",
  WALLET_RESERVATION_FAILED: "WALLET_RESERVATION_UNAVAILABLE",
  WALLET_RESERVATION_INVALID: "WALLET_RESERVATION_UNAVAILABLE",
  CART_LOOKUP_FAILED: "CHECKOUT_SERVICE_UNAVAILABLE",
  PRODUCT_LOOKUP_FAILED: "CHECKOUT_SERVICE_UNAVAILABLE",
  VOUCHER_LOOKUP_FAILED: "CHECKOUT_SERVICE_UNAVAILABLE",
};

function contactValidationCode(details: unknown): CheckoutErrorCode {
  if (!details || typeof details !== 'object' || !('fieldErrors' in details)) return 'CHECKOUT_DETAILS_INVALID';
  const fields = details.fieldErrors;
  if (!fields || typeof fields !== 'object') return 'CHECKOUT_DETAILS_INVALID';
  // Only consume our public validation tokens, never arbitrary validation/provider text.
  const messages = ['contact', 'email', 'phone', 'name'].flatMap(field => {
    const value = (fields as Record<string, unknown>)[field];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  });
  return contactErrorCodes.find(code => messages.includes(code)) ?? 'CHECKOUT_DETAILS_INVALID';
}

export function getCheckoutErrorCode(payload: CheckoutErrorPayload): CheckoutErrorCode {
  if (payload && typeof payload === 'object' && payload.code === 'VALIDATION_FAILED') return contactValidationCode(payload.details);
  const text = payloadText(payload).toLowerCase();
  const canonicalCodes = [
    ...contactErrorCodes, 'CONTACT_PHONE_REQUIRED', 'PAYMENT_SERVICE_UNAVAILABLE', 'PAYMENT_METHOD_UNAVAILABLE',
    'PAYMENT_STATUS_UNCERTAIN', 'CHECKOUT_SERVICE_UNAVAILABLE', 'CHECKOUT_DETAILS_INVALID', 'CHECKOUT_CONNECTION_FAILED',
    'CHECKOUT_RATE_LIMITED', 'GUEST_SESSION_UNAVAILABLE', 'CHECKOUT_CLOSED', 'CART_EMPTY', 'CART_SELECTION_REQUIRED',
    'STAY_DETAILS_REQUIRED', 'FOOD_SERVICE_MODE_REQUIRED', 'FOOD_SERVICE_MODE_UNAVAILABLE', 'WALLET_RESERVATION_UNAVAILABLE',
  ] as const;
  for (const code of canonicalCodes) if (text.includes(code.toLowerCase())) return code;
  for (const [alias, code] of Object.entries(errorAliases)) if (text.includes(alias.toLowerCase())) return code;
  if (text === 'cart is empty') return 'CART_EMPTY';
  if (text === 'select at least one cart item') return 'CART_SELECTION_REQUIRED';
  if (text === 'voucher is not available') return 'VOUCHER_NOT_AVAILABLE';
  if (text === 'food service options could not be verified') return 'CHECKOUT_SERVICE_UNAVAILABLE';
  if (text.includes("active_checkout_exists")) return "ACTIVE_CHECKOUT_EXISTS";
  if (text.includes("checkout_commitment_unavailable")) return "CHECKOUT_COMMITMENT_UNAVAILABLE";
  if (text.includes("booking_capacity_unavailable")) return "BOOKING_CAPACITY_UNAVAILABLE";
  if (text.includes("booking_slot_invalid")) return "BOOKING_SLOT_INVALID";
  if (text.includes("cart_item_unavailable")) return "CART_ITEM_UNAVAILABLE";
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
  if (text.includes("voucher_claim_expired")) return "VOUCHER_CLAIM_EXPIRED";
  if (text.includes("voucher_claim_mismatch")) return "VOUCHER_CLAIM_MISMATCH";
  if (text.includes("voucher_claim_unavailable") || text.includes("voucher_claim_hold_missing")) return "VOUCHER_CLAIM_UNAVAILABLE";
  if (text.includes("new_orders_paused")) return "NEW_ORDERS_PAUSED";
  return "CHECKOUT_FAILED";
}

export function getCheckoutErrorMessage(payload: CheckoutErrorPayload): string {
  switch (getCheckoutErrorCode(payload)) {
    case 'CONTACT_EMAIL_REQUIRED': return 'Enter your contact email before continuing.';
    case 'CONTACT_EMAIL_INVALID': return 'Enter a valid email address, for example name@example.com.';
    case 'CONTACT_PHONE_REQUIRED': return 'Enter a contact phone number for the selected payment method.';
    case 'CONTACT_PHONE_INVALID': return 'Check the country code and enter a valid phone number.';
    case 'CONTACT_NAME_INVALID': return 'Enter a contact name of up to 100 characters, or leave it blank.';
    case 'PAYMENT_SERVICE_UNAVAILABLE': return 'Payment service is temporarily unavailable. Try again later or choose another available payment method.';
    case 'PAYMENT_METHOD_UNAVAILABLE': return 'This payment method is unavailable. Choose another payment method.';
    case 'PAYMENT_STATUS_UNCERTAIN': return 'We could not confirm the payment setup. Check your order before starting another payment.';
    case 'CHECKOUT_SERVICE_UNAVAILABLE': return 'We cannot verify your checkout right now. Please try again later.';
    case 'CHECKOUT_DETAILS_INVALID': return 'Review your checkout details and correct any invalid fields before continuing.';
    case 'CHECKOUT_CONNECTION_FAILED': return 'Your connection was interrupted. Check your connection and order before trying again.';
    case 'CHECKOUT_RATE_LIMITED': return 'Too many checkout attempts. Wait a few minutes before trying again.';
    case 'GUEST_SESSION_UNAVAILABLE': return 'Guest checkout is temporarily unavailable. Refresh the page and try again.';
    case 'CHECKOUT_CLOSED': return 'This checkout has closed. Check your order before paying again.';
    case 'CART_EMPTY': return 'Your cart is empty. Add an item before checking out.';
    case 'CART_SELECTION_REQUIRED': return 'Select at least one item in your cart before checking out.';
    case 'STAY_DETAILS_REQUIRED': return 'Return to your cart and complete the guest details for each accommodation booking.';
    case 'FOOD_SERVICE_MODE_REQUIRED': return 'Choose dine-in or takeaway for each food outlet before continuing.';
    case 'FOOD_SERVICE_MODE_UNAVAILABLE': return 'The selected dine-in or takeaway option is unavailable. Refresh checkout and choose an available option.';
    case 'WALLET_RESERVATION_UNAVAILABLE': return 'Your Wallet payment could not be reserved. Refresh checkout and try again.';
    case "ACTIVE_CHECKOUT_EXISTS":
      return "Complete or cancel your existing unpaid order before starting another checkout.";
    case "CHECKOUT_COMMITMENT_UNAVAILABLE":
      return "Your checkout expired or purchase eligibility changed. Review your order before paying again.";
    case "BOOKING_CAPACITY_UNAVAILABLE":
      return "This time slot was just booked by another customer. Please choose another available slot.";
    case "BOOKING_SLOT_INVALID":
      return "This time slot is no longer valid. Please return to your cart and choose another slot.";
    case "CART_ITEM_UNAVAILABLE":
      return "One or more cart items are no longer available. Refresh your cart and try again.";
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
    case "VOUCHER_CLAIM_EXPIRED":
      return "This claimed voucher has expired. Please choose another voucher.";
    case "VOUCHER_CLAIM_MISMATCH":
      return "This voucher claim does not match the selected voucher.";
    case "VOUCHER_CLAIM_UNAVAILABLE":
      return "This voucher claim is no longer available. Please choose another voucher.";
    case "NEW_ORDERS_PAUSED":
      return "New orders are temporarily unavailable. Please try again later.";
    case "CHECKOUT_FAILED":
    default:
      return "We could not start checkout right now. Please try again.";
  }
}

export function getCheckoutErrorTranslationKey(payload: CheckoutErrorPayload) {
  return `checkoutErrors.${getCheckoutErrorCode(payload)}` as const;
}

export function getCheckoutErrorRecovery(payload: CheckoutErrorPayload): 'email' | 'phone' | 'name' | 'cart' | 'orders' | 'wallet' | 'retry' {
  const code = getCheckoutErrorCode(payload);
  if (code === 'CONTACT_EMAIL_REQUIRED' || code === 'CONTACT_EMAIL_INVALID') return 'email';
  if (code === 'CONTACT_PHONE_REQUIRED' || code === 'CONTACT_PHONE_INVALID') return 'phone';
  if (code === 'CONTACT_NAME_INVALID') return 'name';
  if (code === 'WALLET_INSUFFICIENT') return 'wallet';
  if (['ACTIVE_CHECKOUT_EXISTS', 'CHECKOUT_COMMITMENT_UNAVAILABLE', 'CHECKOUT_CLOSED', 'PAYMENT_STATUS_UNCERTAIN', 'CHECKOUT_CONNECTION_FAILED'].includes(code)) return 'orders';
  if (code.startsWith('VOUCHER_') || ['BOOKING_CAPACITY_UNAVAILABLE', 'BOOKING_SLOT_INVALID', 'CART_ITEM_UNAVAILABLE', 'INVENTORY_UNAVAILABLE', 'CART_EMPTY', 'CART_SELECTION_REQUIRED', 'STAY_DETAILS_REQUIRED'].includes(code)) return 'cart';
  return 'retry';
}

/** Postgres DETAIL is untrusted text; expose only the validated owner-bound ID. */
export function activeCheckoutOrderId(details: string | null | undefined): string | undefined {
  try {
    const id = JSON.parse(details ?? "{}").order_id;
    return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
  } catch { return undefined; }
}
