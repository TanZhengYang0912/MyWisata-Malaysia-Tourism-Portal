export const PROFILE_COMPLETION_FIELDS = ['full_name', 'avatar', 'bio', 'city', 'country'] as const;
export const PROFILE_BIO_MIN_LENGTH = 3;
export const PROFILE_BIO_MAX_LENGTH = 30;
export const LEGACY_PROFILE_BIO_MAX_LENGTH = 200;

export type ProfileField = typeof PROFILE_COMPLETION_FIELDS[number];
export type ProfileCompletionPercentage = 0 | 20 | 40 | 60 | 80 | 100;
export type ProfileVerificationPercentage = 0 | 33 | 67 | 100;

export type ProfileCompletion = {
  percentage: ProfileCompletionPercentage;
  missing: ProfileField[];
  complete: boolean;
};

export const PROFILE_VERIFICATION_STEPS = ['identity', 'avatar', 'bio'] as const;
export type ProfileVerificationStep = typeof PROFILE_VERIFICATION_STEPS[number];
export type ProfileVerification = {
  complete: boolean;
  percentage: ProfileVerificationPercentage;
  completedSteps: ProfileVerificationStep[];
  currentStep: ProfileVerificationStep | null;
};

export type EligibilitySnapshot = {
  emailVerified: boolean;
  phoneVerified: boolean;
  kycStatus: 'unverified' | 'pending' | 'approved' | 'rejected';
  profile: ProfileCompletion;
  payoutDestinationVerified: boolean;
};

const DEFAULT_AVATAR_NAMES = new Set([
  'default-avatar.png',
  'default-avatar.jpg',
  'default-avatar.jpeg',
  'default-avatar.webp',
  'default-avatar.svg',
]);

function hasUploadedAvatar(value: string | null | undefined): boolean {
  const avatar = value?.trim();
  if (!avatar) return false;
  const name = avatar.split('/').pop()?.split('?')[0]?.toLowerCase();
  return !name || !DEFAULT_AVATAR_NAMES.has(name);
}

export function computeProfileCompletion(input: {
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  profileCompletedAt?: string | null;
}): ProfileCompletion {
  const completed: Record<ProfileField, boolean> = {
    full_name: (input.fullName?.trim().length ?? 0) >= 2,
    avatar: hasUploadedAvatar(input.avatarUrl),
    bio: (() => {
      const length = input.bio?.trim().length ?? 0;
      // Previously completed profiles keep their accepted biography until edited.
      const maximum = input.profileCompletedAt ? LEGACY_PROFILE_BIO_MAX_LENGTH : PROFILE_BIO_MAX_LENGTH;
      return length >= PROFILE_BIO_MIN_LENGTH && length <= maximum;
    })(),
    city: Boolean(input.city?.trim()),
    country: Boolean(input.country?.trim()),
  };
  const missing = PROFILE_COMPLETION_FIELDS.filter((field) => !completed[field]);
  const percentage = ((PROFILE_COMPLETION_FIELDS.length - missing.length) * 20) as ProfileCompletionPercentage;
  return { percentage, missing, complete: missing.length === 0 };
}

export function computeProfileVerification(input: {
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  profileCompletedAt?: string | null;
}): ProfileVerification {
  const richness = computeProfileCompletion(input);
  const completed: Record<ProfileVerificationStep, boolean> = {
    identity: !richness.missing.includes('full_name')
      && !richness.missing.includes('city')
      && !richness.missing.includes('country'),
    avatar: !richness.missing.includes('avatar'),
    bio: !richness.missing.includes('bio'),
  };
  const completedSteps = PROFILE_VERIFICATION_STEPS.filter((step) => completed[step]);
  const currentStep = PROFILE_VERIFICATION_STEPS.find((step) => !completed[step]) ?? null;
  const percentage = Math.round((completedSteps.length / PROFILE_VERIFICATION_STEPS.length) * 100) as ProfileVerificationPercentage;
  return { complete: currentStep == null, percentage, completedSteps, currentStep };
}

export function canSubmitRecommendation(snapshot: EligibilitySnapshot): boolean {
  return snapshot.emailVerified && snapshot.phoneVerified && snapshot.profile.complete;
}

export function canWithdraw(snapshot: EligibilitySnapshot): boolean {
  return snapshot.emailVerified
    && snapshot.phoneVerified
    && snapshot.profile.complete
    && snapshot.kycStatus === 'approved'
    && snapshot.payoutDestinationVerified;
}

export function isVerifiedContributor(input: {
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  kycStatus: string | null;
  profile: Parameters<typeof computeProfileCompletion>[0];
}): boolean {
  return Boolean(input.emailVerifiedAt && input.phoneVerifiedAt && input.kycStatus === 'approved'
    && computeProfileCompletion(input.profile).complete);
}
