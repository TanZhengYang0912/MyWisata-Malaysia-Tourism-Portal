export const BUSINESS_TYPE_OPTIONS = [
  { value: 'food_and_tourism', label: 'Food & tourism' },
  { value: 'tours_and_activities', label: 'Tours & activities' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'arts_and_crafts', label: 'Arts & crafts' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'retail', label: 'Retail' },
  { value: 'other', label: 'Other' },
] as const;

const BUSINESS_TYPE_LABELS = new Map<string, string>(BUSINESS_TYPE_OPTIONS.map((option) => [option.value, option.label]));

function capitalizeWords(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function businessTypeLabel(value: string | null | undefined) {
  if (!value) return 'Not selected';
  return BUSINESS_TYPE_LABELS.get(value) || capitalizeWords(value);
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Under review',
  rejected: 'Changes requested',
  suspended: 'Suspended',
};

export function statusLabel(value: string | null | undefined) {
  return STATUS_LABELS[value || ''] || 'Under review';
}

export function statusDescription(value: string | null | undefined) {
  switch (value) {
    case 'approved':
      return 'Your profile is approved and visible to customers.';
    case 'rejected':
      return 'Please update the requested details before resubmitting your profile.';
    case 'suspended':
      return 'Your profile is temporarily hidden while the account is being reviewed.';
    default:
      return 'Your profile is not public yet while the team completes its review.';
  }
}
