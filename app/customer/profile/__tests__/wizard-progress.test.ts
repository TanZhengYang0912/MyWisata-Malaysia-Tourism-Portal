import { describe, expect, it } from 'vitest';
import { getWizardProgress } from '../wizard-progress';

describe('verification wizard progress', () => {
  it('uses the server-derived verification contract', () => {
    expect(getWizardProgress({
      complete: false,
      percentage: 20,
      completedSteps: ['phone'],
      currentStep: 'identity',
    })).toEqual({
      currentStep: 2,
      totalSteps: 5,
      currentLabel: 'Identity',
      nextLabel: 'Avatar',
      percentage: 20,
    });
  });

  it('shows 100 percent in the completed state', () => {
    expect(getWizardProgress({
      complete: true,
      percentage: 100,
      completedSteps: ['phone', 'identity', 'avatar', 'bio', 'survey'],
      currentStep: null,
    })).toEqual({
      currentStep: 5,
      totalSteps: 5,
      currentLabel: 'Complete',
      nextLabel: null,
      percentage: 100,
    });
  });
});
