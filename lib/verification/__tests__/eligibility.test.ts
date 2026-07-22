import { describe, expect, it } from 'vitest';
import {
  canCreateBooking,
  canCreatePurchase,
  canSubmitRecommendation,
  canWithdraw,
  computeProfileCompletion,
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

  it('requires KYC, phone, and payout destination for withdrawal', () => {
    expect(canWithdraw(snapshot)).toBe(true);
    expect(canWithdraw({ ...snapshot, payoutDestinationVerified: false })).toBe(false);
    expect(canWithdraw({ ...snapshot, kycStatus: 'pending' })).toBe(false);
    expect(canWithdraw({ ...snapshot, phoneVerified: false })).toBe(false);
  });
});
