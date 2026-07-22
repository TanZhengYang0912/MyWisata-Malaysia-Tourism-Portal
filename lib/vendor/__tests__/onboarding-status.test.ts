import { describe, expect, it } from 'vitest';
import { getVendorOnboardingStatus } from '../onboarding-status';

describe('getVendorOnboardingStatus', () => {
  it('describes a private draft setup state', () => {
    expect(getVendorOnboardingStatus('draft')).toEqual({
      label: 'Setup in progress',
      description: 'Your business profile, outlets and listings are private until you submit them for review.',
    });
  });

  it('describes pending vendor review without exposing the vendor publicly', () => {
    expect(getVendorOnboardingStatus('pending_review')).toEqual({
      label: 'Pending admin review',
      description: 'Your vendor setup is under admin review and is not public yet.',
    });
  });
});
