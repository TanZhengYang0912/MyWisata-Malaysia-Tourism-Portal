import { describe, expect, it } from 'vitest';
import {
  canSubmitRecommendation,
  canWithdraw,
  computeProfileCompletion,
  computeProfileVerification,
  isVerifiedContributor,
} from '../eligibility';

const completeProfile = {
  fullName: 'Aisha Ali',
  avatarUrl: '/uploads/aisha.webp',
  bio: 'A local food guide.',
  city: 'Kuala Lumpur',
  country: 'Malaysia',
};

describe('computeProfileCompletion', () => {
  it.each([0, 2, 31, 200, 201])('keeps an uncompleted %i-character bio incomplete', (length) => {
    expect(computeProfileCompletion({ ...completeProfile, bio: 'x'.repeat(length) }).missing).toContain('bio');
  });

  it.each([3, 30])('accepts a new %i-character bio for completion', (length) => {
    expect(computeProfileCompletion({ ...completeProfile, bio: 'x'.repeat(length) }).complete).toBe(true);
  });

  it.each([31, 200])('preserves a previously completed %i-character biography', (length) => {
    expect(computeProfileVerification({
      ...completeProfile, bio: 'x'.repeat(length), profileCompletedAt: '2026-10-27T00:00:00Z',
    }).complete).toBe(true);
  });

  it.each([0, 2, 201])('does not use a completion timestamp to accept an invalid %i-character bio', (length) => {
    expect(computeProfileCompletion({
      ...completeProfile, bio: 'x'.repeat(length), profileCompletedAt: '2026-10-27T00:00:00Z',
    }).missing).toContain('bio');
  });

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
  it('completes Profile from the five core fields without requiring the survey or Phone', () => {
    expect(computeProfileVerification({
      ...completeProfile,
    })).toEqual({
      complete: true,
      percentage: 100,
      completedSteps: ['identity', 'avatar', 'bio'],
      currentStep: null,
    });
  });

  it('reports three stable progress steps independently of survey completion', () => {
    expect(computeProfileVerification({
      ...completeProfile,
      avatarUrl: null,
    })).toEqual({
      complete: false,
      percentage: 67,
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
    })).toMatchObject({
      complete: false,
      percentage: 67,
      completedSteps: ['identity', 'bio'],
      currentStep: 'avatar',
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

  it('requires Email, Phone and the completed profile for recommendations', () => {
    expect(canSubmitRecommendation(snapshot)).toBe(true);
    expect(canSubmitRecommendation({ ...snapshot, emailVerified: false })).toBe(false);
    expect(canSubmitRecommendation({ ...snapshot, phoneVerified: false })).toBe(false);
    expect(canSubmitRecommendation({ ...snapshot, profile: { percentage: 80, missing: ['country'], complete: false } })).toBe(false);
  });

  it('requires Email, Phone, Profile, KYC and payout readiness for withdrawal', () => {
    expect(canWithdraw(snapshot)).toBe(true);
    expect(canWithdraw({ ...snapshot, payoutDestinationVerified: false })).toBe(false);
    expect(canWithdraw({ ...snapshot, kycStatus: 'pending' })).toBe(false);
    expect(canWithdraw({ ...snapshot, emailVerified: false })).toBe(false);
    expect(canWithdraw({ ...snapshot, phoneVerified: false })).toBe(false);
    expect(canWithdraw({ ...snapshot, profile: { percentage: 80, missing: ['country'], complete: false } })).toBe(false);
  });
});

describe('Verified Contributor eligibility', () => {
  const facts = {
    emailVerifiedAt: '2026-10-01T00:00:00Z',
    phoneVerifiedAt: '2026-10-01T00:01:00Z',
    kycStatus: 'approved',
    profile: completeProfile,
  };

  it('requires Email, Phone, all core Profile fields and approved KYC', () => {
    expect(isVerifiedContributor(facts)).toBe(true);
    expect(isVerifiedContributor({ ...facts, emailVerifiedAt: null })).toBe(false);
    expect(isVerifiedContributor({ ...facts, phoneVerifiedAt: null })).toBe(false);
    expect(isVerifiedContributor({ ...facts, kycStatus: 'pending' })).toBe(false);
    expect(isVerifiedContributor({ ...facts, profile: { ...completeProfile, avatarUrl: null } })).toBe(false);
  });
});
