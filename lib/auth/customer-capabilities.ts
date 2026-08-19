import { guestLoginHref, postLoginPath } from "@/lib/auth/guest-mode";
import { meetsMinTier, REQUIRED_TIER, type Tier } from "@/lib/constants";

export const CUSTOMER_CAPABILITY = {
  BROWSE: "browse",
  ACCOUNT_MUTATION: "account_mutation",
  CART_MUTATION: "cart_mutation",
  CHECKOUT: "checkout",
  BASIC_AI: "basic_ai",
  RECOMMENDATION_SUBMIT: "recommendation_submit",
  AFFILIATE_LIMITED: "affiliate_limited",
  AFFILIATE_FULL: "affiliate_full",
  WITHDRAWAL: "withdrawal",
} as const;

export type CustomerCapability = typeof CUSTOMER_CAPABILITY[keyof typeof CUSTOMER_CAPABILITY];

export type CustomerAccessDecision =
  | "allowed"
  | "sign_in_required"
  | "phone_verification_required"
  | "profile_completion_required"
  | "kyc_required";

type CustomerViewer = { verificationTier: Tier } | null;

export function resolveCustomerAccess(
  viewer: CustomerViewer,
  capability: CustomerCapability,
): CustomerAccessDecision {
  if (capability === CUSTOMER_CAPABILITY.BROWSE) return "allowed";
  if (!viewer) return "sign_in_required";
  if (
    capability === CUSTOMER_CAPABILITY.ACCOUNT_MUTATION
    || capability === CUSTOMER_CAPABILITY.CART_MUTATION
  ) {
    return "allowed";
  }
  if (
    capability === CUSTOMER_CAPABILITY.CHECKOUT
    || capability === CUSTOMER_CAPABILITY.BASIC_AI
  ) {
    const required = capability === CUSTOMER_CAPABILITY.BASIC_AI
      ? REQUIRED_TIER.BASIC_AI
      : REQUIRED_TIER.CHECKOUT;
    return meetsMinTier(viewer.verificationTier, required)
      ? "allowed"
      : "phone_verification_required";
  }
  if (
    capability === CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT
    || capability === CUSTOMER_CAPABILITY.AFFILIATE_LIMITED
  ) {
    return meetsMinTier(viewer.verificationTier, REQUIRED_TIER.RECOMMENDATION)
      ? "allowed"
      : "profile_completion_required";
  }
  const required = capability === CUSTOMER_CAPABILITY.AFFILIATE_FULL
    ? REQUIRED_TIER.AFFILIATE_FULL
    : REQUIRED_TIER.WITHDRAWAL;
  return meetsMinTier(viewer.verificationTier, required)
    ? "allowed"
    : "kyc_required";
}

export function customerAccessHref(
  decision: Exclude<CustomerAccessDecision, "allowed">,
  nextPath: string,
): string {
  const safeNext = postLoginPath(nextPath) ?? "/customer";
  if (decision === "sign_in_required") return guestLoginHref(safeNext);
  if (decision === "kyc_required") {
    return `/customer/kyc?next=${encodeURIComponent(safeNext)}`;
  }
  return `/customer/profile?next=${encodeURIComponent(safeNext)}`;
}
