import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = () => readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const clientSource = () => readFileSync(new URL('../../../components/vendor/vendor-invite-client.tsx', import.meta.url), 'utf8');
const formSource = () => readFileSync(new URL('../../../components/vendor/vendor-claim-form.tsx', import.meta.url), 'utf8');

describe('public vendor invitation page contract', () => {
  it('lives outside the protected vendor portal and renders the invite client', () => {
    expect(pageSource()).toContain('VendorInviteClient');
    expect(pageSource()).not.toContain('VendorLayout');
    expect(pageSource()).not.toContain("redirect('/login')");
  });

  it('shows safe recommendation evidence without recommender identity', () => {
    const source = clientSource();
    expect(source).toContain('Recommendation details');
    expect(source).toContain('A MyWisata member recommended this business.');
    expect(source).toContain('Pre-filled from a customer recommendation');
    expect(source).toContain('/api/vendor-invite/preview');
    expect(source).toContain('AbortController');
    expect(source).not.toContain('recommender.email');
    expect(source).not.toContain('recommender.name');
  });

  it('keeps the fixed six fields editable and preserves edits through login', () => {
    const source = formSource();
    for (const field of ['businessName', 'legalBusinessName', 'businessType', 'contactEmail', 'contactPhone', 'businessAddress']) {
      expect(source).toContain(field);
    }
    expect(source).toContain('initialValues');
    expect(source).toContain('sessionStorage');
    expect(source).toContain('mywisata.vendor-invite-draft');
    expect(source).toContain('/login?next=');
    expect(source).not.toContain('kycDocument');
    expect(source).not.toContain('stripeSecret');
  });
});
