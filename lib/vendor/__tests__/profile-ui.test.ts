import { describe, expect, it } from 'vitest';
import { BUSINESS_TYPE_OPTIONS, businessTypeLabel, statusDescription, statusLabel } from '@/lib/vendor/profile-ui';

describe('vendor profile presentation helpers', () => {
  it('provides friendly business type options for the profile form', () => {
    expect(BUSINESS_TYPE_OPTIONS).toContainEqual({ value: 'food_and_tourism', label: 'Food & tourism' });
    expect(BUSINESS_TYPE_OPTIONS).toContainEqual({ value: 'accommodation', label: 'Accommodation' });
  });

  it('turns stored business type values into readable labels', () => {
    expect(businessTypeLabel('food_and_tourism')).toBe('Food & tourism');
    expect(businessTypeLabel('heritage-tours')).toBe('Heritage tours');
    expect(businessTypeLabel(null)).toBe('Not selected');
  });

  it('explains vendor visibility in customer-facing language', () => {
    expect(statusLabel('approved')).toBe('Approved');
    expect(statusDescription('approved')).toContain('visible to customers');
    expect(statusLabel('unknown')).toBe('Under review');
  });
});
