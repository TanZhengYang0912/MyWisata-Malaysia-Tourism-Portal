export type VendorOnboardingStatus = "pending" | "approved" | "rejected" | "suspended";

const STATUS_COPY: Record<VendorOnboardingStatus, { label: string; description: string }> = {
  pending: {
    label: "Pending admin review",
    description: "Your application is in the admin queue. You can add outlets and listings after approval.",
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
