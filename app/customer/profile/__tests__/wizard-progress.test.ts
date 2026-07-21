import { describe, expect, it } from 'vitest';
import { getWizardProgress } from '../wizard-progress';

describe('verification wizard progress', () => {
  it('shows the current and next step without rebasing skipped steps', () => {
    expect(getWizardProgress(1)).toEqual({
      currentStep: 2,
      totalSteps: 5,
      currentLabel: 'Identity',
      nextLabel: 'Avatar',
      percentage: 20,
    });
  });

  it('shows 100 percent in the completed state', () => {
    expect(getWizardProgress(-1)).toEqual({
      currentStep: 5,
      totalSteps: 5,
      currentLabel: 'Complete',
      nextLabel: null,
      percentage: 100,
    });
  });
});
