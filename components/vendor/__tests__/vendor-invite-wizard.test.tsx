import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wizardSource = () => readFileSync(new URL('../vendor-invite-wizard.tsx', import.meta.url), 'utf8');
const accountSource = () => readFileSync(new URL('../vendor-invite-account-step.tsx', import.meta.url), 'utf8');
const detailsSource = () => readFileSync(new URL('../vendor-invite-details-step.tsx', import.meta.url), 'utf8');
const stateSource = () => readFileSync(new URL('../vendor-invite-wizard-state.ts', import.meta.url), 'utf8');

describe('VendorInviteWizard contract', () => {
  it('starts with an account step offering only invitation-bound email OTP and Google', () => {
    const source = `${wizardSource()}\n${accountSource()}\n${stateSource()}`;

    expect(source).toContain("'account' | 'details' | 'verify'");
    expect(source).toContain('Step {stepNumber} of 3');
    expect(source).toContain('Send 6-digit email code');
    expect(source).toContain('Continue with Google');
    expect(source).toContain('/api/vendor-invite/auth/email/send');
    expect(source).toContain('/api/vendor-invite/auth/email/verify');
    expect(source).toContain("provider: 'google'");
    expect(source).toContain('/auth/callback?next=${encodeURIComponent(next)}');
    expect(source).not.toContain('type="password"');
  });

  it('advances an authenticated matching invitation to editable Vendor and outlet details', () => {
    const source = `${wizardSource()}\n${detailsSource()}`;

    expect(source).toContain("activeStep === 'details'");
    expect(source).toContain('Vendor brand');
    expect(source).toContain('First outlet');
    expect(source).toContain('First outlet name');
    expect(source).toContain('Business phone (optional)');
    expect(source).toContain('type="radio"');
    expect(source).toContain("name=\"category\"");
    expect(source).toContain("update('categoryId', category.id)");
    expect(source).toContain("update('outletName', event.target.value)");
  });

  it('keeps a privacy-safe v2 session draft scoped by a non-reversible token fingerprint', () => {
    const source = `${wizardSource()}\n${stateSource()}`;

    expect(source).toContain('mywisata.vendor-invite-wizard-v2');
    expect(source).toContain('crypto.subtle.digest');
    expect(source).toContain('tokenFingerprint');
    expect(source).toContain('dirtyFields');
    expect(source).toContain('version: 2');
    expect(source).toContain('mergeUntouchedVendorInviteDraft');
    expect(source).not.toContain('sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token');
  });

  it('integrates phone verification, atomic claim submission, and private-until-review completion', () => {
    const source = wizardSource();

    expect(source).toContain('VendorInvitePhoneStep');
    expect(source).toContain('submitGuidedVendorClaim');
    expect(source).toContain('submittingRef.current');
    expect(source).toContain('window.sessionStorage.removeItem');
    expect(source).toContain('Vendor application submitted');
    expect(source).toContain('private while MyWisata reviews the application');
    expect(source).toContain('Vendor invitation inactive');
  });
});
