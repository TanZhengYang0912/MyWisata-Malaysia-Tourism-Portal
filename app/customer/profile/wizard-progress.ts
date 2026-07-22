export const WIZARD_STEPS = [
  { id: 'phone', label: 'Phone' },
  { id: 'identity', label: 'Identity' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'bio', label: 'Bio' },
  { id: 'survey', label: 'Survey' },
] as const;

export type WizardProgress = {
  currentStep: 1 | 2 | 3 | 4 | 5;
  totalSteps: 5;
  currentLabel: (typeof WIZARD_STEPS)[number]['label'] | 'Complete';
  nextLabel: string | null;
  percentage: 0 | 20 | 40 | 60 | 80 | 100;
};

export function getWizardProgress(step: number): WizardProgress {
  if (step < 0) {
    return { currentStep: 5, totalSteps: 5, currentLabel: 'Complete', nextLabel: null, percentage: 100 };
  }

  const currentIndex = Math.min(step, WIZARD_STEPS.length - 1);
  const current = WIZARD_STEPS[currentIndex];
  const next = WIZARD_STEPS[currentIndex + 1] ?? null;
  return {
    currentStep: (currentIndex + 1) as WizardProgress['currentStep'],
    totalSteps: 5,
    currentLabel: current.label,
    nextLabel: next?.label ?? null,
    percentage: (currentIndex * 20) as WizardProgress['percentage'],
  };
}
