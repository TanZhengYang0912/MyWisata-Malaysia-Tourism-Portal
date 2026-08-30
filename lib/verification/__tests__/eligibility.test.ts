import { describe, expect, it } from 'vitest';
import {
  canCreateBooking,
  canCreatePurchase,
  canSubmitRecommendation,
  canWithdraw,
  computeProfileCompletion,
  computeProfileVerification,
} from '../eligibility';

const completeProfile = {
  fullName: 'Aisha Ali',
  avatarUrl: '/uploads/aisha.webp',
  bio: 'A local food guide with a short profile.',
  city: 'Kuala Lumpur',
  country: 'Malaysia',
};

describe('computeProfileCompletion', () => {
  it('requires all five teacher-specified fields for 100% completion', () => {
    expect(computeProfileCompletion(completeProfile)).toEqual({
      percentage: 100,
      missing: [],
      complete: true,
    });
  });

  it('does not count a default avatar or short bio as complete', () => {
    expect(computeProfileCompletion({
      ...completeProfile,
      avatarUrl: '/default-avatar.png',
      bio: 'Hi',
    })).toEqual({
      percentage: 60,
      missing: ['avatar', 'bio'],
      complete: false,
    });
  });

  it('returns missing fields in stable order and trims values', () => {
    expect(computeProfileCompletion({ fullName: ' A ', city: ' ', country: 'Malaysia' })).toEqual({
      percentage: 20,
      missing: ['full_name', 'avatar', 'bio', 'city'],
      complete: false,
    });
  });
});

describe('computeProfileVerification', () => {
  it('completes Profile from identity, avatar, bio, and survey without Phone', () => {
    expect(computeProfileVerification({
      ...completeProfile,
      surveyComplete: true,
    })).toEqual({
      complete: true,
      percentage: 100,
      completedSteps: ['identity', 'avatar', 'bio', 'survey'],
      currentStep: null,
    });
  });

  it('reports four stable 25-point progress increments', () => {
    expect(computeProfileVerification({
      ...completeProfile,
      avatarUrl: null,
      surveyComplete: false,
    })).toEqual({
      complete: false,
      percentage: 50,
      completedSteps: ['identity', 'bio'],
      currentStep: 'avatar',
    });
  });

  it.each([
    '/default-avatar.png',
    'https://cdn.example/default-avatar.jpg?version=2',
    '/images/DEFAULT-AVATAR.JPEG',
    'default-avatar.webp',
    '/default-avatar.svg',
  ])('rejects the known default avatar %s from Profile completion', (avatarUrl) => {
    expect(computeProfileVerification({
      ...completeProfile,
      avatarUrl,
      surveyComplete: true,
    })).toMatchObject({
      complete: false,
      percentage: 75,
      completedSteps: ['identity', 'bio', 'survey'],
      currentStep: 'avatar',
    });
  });

  it('does not complete Profile when the preference survey has no interests', () => {
    expect(computeProfileVerification({
      ...completeProfile,
      surveyComplete: false,
    })).toMatchObject({
      complete: false,
      percentage: 75,
      completedSteps: ['identity', 'avatar', 'bio'],
      currentStep: 'survey',
    });
  });
});

describe('eligibility predicates', () => {
  const snapshot = {
    emailVerified: true,
    phoneVerified: true,
    kycStatus: 'approved' as const,
    profile: { percentage: 100 as const, missing: [], complete: true },
    payoutDestinationVerified: true,
  };

  it('requires the completed profile for recommendations', () => {
    expect(canSubmitRecommendation(snapshot)).toBe(true);
    expect(canSubmitRecommendation({ ...snapshot, profile: { percentage: 80, missing: ['country'], complete: false } })).toBe(false);
  });

  it('requires phone verification for bookings and purchases', () => {
    expect(canCreateBooking(snapshot)).toBe(true);
    expect(canCreatePurchase(snapshot)).toBe(true);
    expect(canCreateBooking({ ...snapshot, phoneVerified: false })).toBe(false);
    expect(canCreatePurchase({ ...snapshot, phoneVerified: false })).toBe(false);
  });

  it('requires KYC and a payout destination for withdrawal independently of Phone', () => {
    expect(canWithdraw(snapshot)).toBe(true);
    expect(canWithdraw({ ...snapshot, payoutDestinationVerified: false })).toBe(false);
    expect(canWithdraw({ ...snapshot, kycStatus: 'pending' })).toBe(false);
    expect(canWithdraw({ ...snapshot, phoneVerified: false })).toBe(true);
  });
});
