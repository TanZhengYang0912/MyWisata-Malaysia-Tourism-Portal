import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vendor claim registration page contract', () => {
  it('collects the business fields and submits only the one-time claim token', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
    const form = readFileSync(new URL('../../../../components/vendor/vendor-claim-form.tsx', import.meta.url), 'utf8');

    expect(page).toContain('searchParams');
    expect(form).toContain('/api/vendor/claim');
    expect(form).toContain('businessName');
    expect(form).toContain('legalBusinessName');
    expect(form).toContain('contactEmail');
    expect(form).toContain('contactPhone');
    expect(form).toContain('businessAddress');
    expect(form).not.toContain('kycDocument');
    expect(form).not.toContain('stripeSecret');
  });
});
