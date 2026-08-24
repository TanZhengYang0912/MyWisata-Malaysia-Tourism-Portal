import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('profile completion display contract', () => {
  it('renders one server-derived verification progress story at a time', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).not.toContain('computeProfileCompletion');
    expect(page).toContain('profile.verification');
    expect(page).toContain('wizardProgress.percentage');
    expect(page).not.toContain('profileCompletion.percentage');
    expect(page).not.toContain('<ProfileCompletionCard');
  });

  it('reuses the shared identity and bio schemas in wizard and settings', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
    const sections = readFileSync(new URL('../../../../components/profile/profile-sections.tsx', import.meta.url), 'utf8');

    expect(page).toContain('identitySchema.safeParse');
    expect(page).toContain('bioSchema.safeParse');
    expect(sections).toContain('identitySchema.safeParse');
    expect(sections).toContain('bioSchema.safeParse');
  });
});
