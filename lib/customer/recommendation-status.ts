export type RecommendationStatus = "pending" | "approved" | "rejected" | "converted";

const STATUS_COPY: Record<RecommendationStatus, { label: string; description: string }> = {
  pending: {
    label: "Pending review",
    description: "Admin is checking the recommendation and the vendor details.",
  },
  approved: {
    label: "Approved for outreach",
    description: "Admin approved it; the vendor still needs to join or be linked before going live.",
  },
  rejected: {
    label: "Not approved",
    description: "This recommendation was not approved for the marketplace.",
  },
  converted: {
    label: "Vendor joined",
    description: "The vendor joined through your recommendation and commission attribution is active.",
  },
};

export function getRecommendationStatus(status: string) {
  return STATUS_COPY[status as RecommendationStatus] ?? {
    label: status,
    description: "Recommendation status updated.",
  };
}
