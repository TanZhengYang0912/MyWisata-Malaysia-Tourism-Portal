import { describe, expect, it } from 'vitest';
import { getWizardProgress, WIZARD_STEPS } from '../wizard-progress';

describe('verification wizard progress', () => {
  it('uses the server-derived verification contract', () => {
    expect(getWizardProgress({
      complete: false,
      percentage: 25,
      completedSteps: ['identity'],
      currentStep: 'avatar',
    })).toEqual({
      currentStep: 2,
      totalSteps: 4,
      currentLabel: 'Avatar',
      nextLabel: 'Bio',
      percentage: 25,
    });
  });

  it('shows 100 percent in the completed state', () => {
    expect(getWizardProgress({
      complete: true,
      percentage: 100,
      completedSteps: ['identity', 'avatar', 'bio', 'survey'],
      currentStep: null,
    })).toEqual({
      currentStep: 4,
      totalSteps: 4,
      currentLabel: 'Complete',
      nextLabel: null,
      percentage: 100,
    });
  });

  it('contains exactly the four existing profile sections', () => {
    expect(WIZARD_STEPS).toEqual([
      { id: 'identity', label: 'Identity' },
      { id: 'avatar', label: 'Avatar' },
      { id: 'bio', label: 'Bio' },
      { id: 'survey', label: 'Survey' },
    ]);
  });
});
