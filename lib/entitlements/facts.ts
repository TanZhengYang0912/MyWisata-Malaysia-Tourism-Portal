import type { QualificationPath, VerificationFacts } from "@/lib/entitlements/types";

export const QUALIFICATION_PATH = {
  email: { type: "email", href: "/customer/profile" },
  phone: { type: "phone", href: "/customer/phone" },
  profile: { type: "profile", href: "/customer/profile" },
  kyc: { type: "kyc", href: "/customer/kyc" },
} as const satisfies Record<QualificationPath["type"], QualificationPath>;

export function hasEligibleCustomerRole(facts: VerificationFacts): boolean {
  return facts.roles.includes("customer")
    && !facts.roles.includes("vendor_owner")
    && !facts.roles.includes("outlet_manager");
}

export function hasWithdrawalApprovalRole(facts: VerificationFacts): boolean {
  return facts.roles.includes("super_admin") || facts.roles.includes("approver");
}
