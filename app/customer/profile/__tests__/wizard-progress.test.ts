import { describe, expect, it } from 'vitest';
import { canVisitWizardStep, getWizardProgress, WIZARD_STEPS } from '../wizard-progress';

describe('verification wizard progress', () => {
  it('can show an earlier saved step without reducing server completion progress', () => {
    const verification = { complete: false, percentage: 100, completedSteps: ['identity', 'avatar', 'bio'], currentStep: null } as const;
    const input = { ...verification, completedSteps: [...verification.completedSteps] };
    expect(getWizardProgress(input, 'identity')).toMatchObject({ currentStep: 1, currentLabel: 'Identity', percentage: 100 });
    expect(canVisitWizardStep(input, 'identity')).toBe(true);
    expect(canVisitWizardStep(input, 'bio')).toBe(true);
    expect(canVisitWizardStep({ ...input, completedSteps: ['identity'], currentStep: 'avatar' }, 'bio')).toBe(false);
  });
  it('uses the server-derived verification contract', () => {
    expect(getWizardProgress({
      complete: false,
      percentage: 33,
      completedSteps: ['identity'],
      currentStep: 'avatar',
    })).toEqual({
      currentStep: 2,
      totalSteps: 3,
      currentLabel: 'Avatar',
      nextLabel: 'Bio',
      percentage: 33,
    });
  });

  it('shows 100 percent in the completed state', () => {
    expect(getWizardProgress({
      complete: true,
      percentage: 100,
      completedSteps: ['identity', 'avatar', 'bio'],
      currentStep: null,
    })).toEqual({
      currentStep: 3,
      totalSteps: 3,
      currentLabel: 'Complete',
      nextLabel: null,
      percentage: 100,
    });
  });

  it('contains exactly the three core profile sections', () => {
    expect(WIZARD_STEPS).toEqual([
      { id: 'identity', label: 'Identity' },
      { id: 'avatar', label: 'Avatar' },
      { id: 'bio', label: 'Bio' },
    ]);
  });
});
