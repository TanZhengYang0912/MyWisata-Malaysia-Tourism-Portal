export const RECOMMENDATION_STATUSES = [
  'pending',
  'changes_requested',
  'approved',
  'invited',
  'claimed',
  'onboarding',
  'vendor_pending_review',
  'rejected',
  'converted',
] as const;

export type RecommendationStatus = typeof RECOMMENDATION_STATUSES[number];
export type RecommendationStatusGroup = 'action_required' | 'in_review' | 'decided' | 'converted';

const STATUS_GROUP: Record<RecommendationStatus, RecommendationStatusGroup> = {
  pending: 'in_review',
  changes_requested: 'action_required',
  approved: 'decided',
  invited: 'decided',
  claimed: 'decided',
  onboarding: 'decided',
  vendor_pending_review: 'decided',
  rejected: 'decided',
  converted: 'converted',
};

const STATUS_COPY: Record<RecommendationStatus, { label: string; description: string }> = {
  pending: { label: 'Pending review', description: 'Admin is checking the recommendation and the vendor details.' },
  changes_requested: { label: 'Changes requested', description: 'Update the requested recommendation details and resubmit them for review.' },
  approved: { label: 'Approved for outreach', description: 'Admin approved it; the vendor still needs to join or be linked before going live.' },
  invited: { label: 'Vendor invited', description: 'The vendor has been invited to join MyWisata.' },
  claimed: { label: 'Invitation claimed', description: 'The vendor has claimed the invitation and started onboarding.' },
  onboarding: { label: 'Vendor onboarding', description: 'The vendor is completing the onboarding process.' },
  vendor_pending_review: { label: 'Vendor review pending', description: 'The vendor application is waiting for review.' },
  rejected: { label: 'Not approved', description: 'This recommendation was not approved for the marketplace.' },
  converted: { label: 'Vendor joined', description: 'The vendor joined through your recommendation and commission attribution is active.' },
};

export function isRecommendationStatus(status: string): status is RecommendationStatus {
  return RECOMMENDATION_STATUSES.includes(status as RecommendationStatus);
}

export function getRecommendationStatus(status: string) {
  return isRecommendationStatus(status) ? STATUS_COPY[status] : {
    label: 'Status updated',
    description: 'Recommendation status updated.',
  };
}

export function getRecommendationStatusGroup(status: string): RecommendationStatusGroup {
  return isRecommendationStatus(status) ? STATUS_GROUP[status] : 'decided';
}

export function groupRecommendations<T extends { status: string }>(rows: T[]): Record<RecommendationStatusGroup, T[]> {
  const groups: Record<RecommendationStatusGroup, T[]> = {
    action_required: [],
    in_review: [],
    decided: [],
    converted: [],
  };
  for (const row of rows) groups[getRecommendationStatusGroup(row.status)].push(row);
  return groups;
}
