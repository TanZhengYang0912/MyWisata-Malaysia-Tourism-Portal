import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = () => readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const clientSource = () => readFileSync(new URL('../../../components/vendor/vendor-invite-client.tsx', import.meta.url), 'utf8');

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

  it('hosts the guided wizard instead of the legacy claim form', () => {
    const source = clientSource();

    expect(source).toContain('VendorInviteWizard');
    expect(source).toContain('<VendorInviteWizard token={token} preview={preview} onReload={loadPreview} />');
    expect(source).not.toContain('VendorClaimForm');
    expect(source).toContain('Request a new invitation');
    expect(source).toContain('Contact MyWisata support');
  });
});
