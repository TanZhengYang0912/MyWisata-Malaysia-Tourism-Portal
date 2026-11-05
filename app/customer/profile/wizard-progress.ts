export const WIZARD_STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'bio', label: 'Bio' },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]['id'];

export function canVisitWizardStep(verification: ProfileVerification, step: WizardStep): boolean {
  return verification.complete || verification.currentStep === step || verification.completedSteps.includes(step);
}

export type WizardProgress = {
  currentStep: 1 | 2 | 3;
  totalSteps: 3;
  currentLabel: (typeof WIZARD_STEPS)[number]['label'] | 'Complete';
  nextLabel: string | null;
  percentage: 0 | 33 | 67 | 100;
};

export function getWizardProgress(verification: ProfileVerification, displayedStep?: WizardStep | null): WizardProgress {
  if (!displayedStep && (verification.complete || verification.currentStep == null)) {
    return { currentStep: 3, totalSteps: 3, currentLabel: 'Complete', nextLabel: null, percentage: 100 };
  }

  const currentIndex = Math.max(0, WIZARD_STEPS.findIndex((step) => step.id === (displayedStep ?? verification.currentStep)));
  const current = WIZARD_STEPS[currentIndex];
  const next = WIZARD_STEPS[currentIndex + 1] ?? null;
  return {
    currentStep: (currentIndex + 1) as WizardProgress['currentStep'],
    totalSteps: 3,
    currentLabel: current.label,
    nextLabel: next?.label ?? null,
    percentage: verification.percentage,
  };
}
import type { ProfileVerification } from '@/lib/verification/eligibility';
