import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('profile completion display contract', () => {
  it('renders the field-based percentage separately from wizard progress', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('computeProfileCompletion');
    expect(page).toContain('t("ui.profileWizard.completion")');
    expect(page).toContain('aria-valuenow');
    expect(page).toContain('wizardProgress.percentage');
    expect(page).toContain('profileCompletion.percentage');
  });
});
