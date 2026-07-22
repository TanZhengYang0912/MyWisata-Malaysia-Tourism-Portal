export type VendorOnboardingStatus = "draft" | "pending" | "pending_review" | "approved" | "rejected" | "suspended";

const STATUS_COPY: Record<VendorOnboardingStatus, { label: string; description: string }> = {
  draft: {
    label: "Setup in progress",
    description: "Your business profile, outlets and listings are private until you submit them for review.",
  },
  pending: {
    label: "Draft setup",
    description: "Your vendor application is pending. You can continue adding private outlets and listings before review.",
  },
  pending_review: {
    label: "Pending admin review",
    description: "Your vendor setup is under admin review and is not public yet.",
  },
  approved: {
    label: "Approved",
    description: "Your vendor account is approved. Continue to your vendor dashboard to set up the outlet and listings.",
  },
  rejected: {
    label: "Needs changes",
    description: "Admin requested changes before this vendor can go live. Please review the feedback or contact support.",
  },
  suspended: {
    label: "Suspended",
    description: "This vendor account is temporarily unavailable. Please contact support for the next steps.",
  },
};

export function getVendorOnboardingStatus(status: string) {
  return STATUS_COPY[status as VendorOnboardingStatus] ?? {
    label: "Under review",
    description: "Your application is being reviewed by the MyWisata team.",
  };
}
