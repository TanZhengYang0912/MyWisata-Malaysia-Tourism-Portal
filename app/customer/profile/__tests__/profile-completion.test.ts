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
    expect(page).toContain('import { ProfileLocationFields }');
    expect(page).toContain('<ProfileLocationFields');
  });

  it('uses a neutral identity verification heading for every KYC status', () => {
    const sections = readFileSync(new URL('../../../../components/profile/profile-sections.tsx', import.meta.url), 'utf8');
    const kycPage = readFileSync(new URL('../../../../components/kyc/kyc-submission-page.tsx', import.meta.url), 'utf8');

    expect(sections).toContain('tCustomer("ui.profileSections.identityVerification")');
    expect(sections).not.toContain('title={tCustomer("ui.kyc.verified")}');
    expect(kycPage).toContain('title={tCustomer("ui.profileSections.identityVerification")}');
  });

  it('keeps Phone outside the four-step profile flow and returns only after Profile completion', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

    expect(page).toContain('<BusinessShareBanner />');
    expect(page).toContain('import { VerificationPathCards }');
    expect(page.match(/<VerificationPathCards/g)).toHaveLength(2);
    expect(page.match(/<BusinessShareBanner \/>[\s\S]{0,260}<VerificationPathCards/g)).toHaveLength(2);
    expect(page).toContain('phoneVerified={profile.phoneVerified}');
    expect(page).toContain('kycStatus={profile.kycStatus}');
    expect(page).not.toContain('phoneVerified={verificationFacts');
    expect(page).toContain('const visibleSteps = WIZARD_STEPS');
    expect(page).not.toContain('PhoneVerificationCard');
    expect(page).not.toContain('/api/phone/send-otp');
    expect(page).not.toContain('/api/phone/verify-otp');
    expect(page).not.toContain('phoneOnlyIntent');
    const submitBioSource = page.slice(
      page.indexOf('async function submitBio'),
      page.indexOf('async function handlePreferencesSaved'),
    );
    expect(submitBioSource).not.toContain('router.push(continuation)');
    expect(page).toMatch(/handlePreferencesSaved[\s\S]*?if \(continuation\) router\.push\(continuation\)/);
  });

  it('keeps KYC independent while offering optional navigation back to Profile', () => {
    const kycPage = readFileSync(new URL('../../../../components/kyc/kyc-submission-page.tsx', import.meta.url), 'utf8');
    const customerRoute = readFileSync(new URL('../../kyc/page.tsx', import.meta.url), 'utf8');

    expect(kycPage).toContain('verificationFacts?.kycStatus');
    expect(kycPage).not.toContain('TIER_STEPS');
    expect(kycPage).not.toContain('isProfileComplete');
    expect(kycPage).toContain('href={backHref}');
    expect(kycPage).toContain('tCustomer(backLabelKey)');
    expect(customerRoute).toContain('backHref="/customer/profile"');
    expect(customerRoute).toContain('backLabelKey="ui.profile.backToProfile"');
  });

  it('uses the same upload and camera picker in wizard and completed Profile settings', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
    const sections = readFileSync(new URL('../../../../components/profile/profile-sections.tsx', import.meta.url), 'utf8');

    expect(page).toContain('import { ProfilePhotoPicker }');
    expect(page).toContain('<ProfilePhotoPicker');
    expect(sections).toContain('import { ProfilePhotoPicker }');
    expect(sections).toContain('<ProfilePhotoPicker');
    expect(page).toContain('/api/profile/avatar?type=');
    expect(page).toContain('/api/profile/avatar/confirm');
    expect(sections).toContain('/api/profile/avatar?type=');
    expect(sections).toContain('/api/profile/avatar/confirm');
  });
});
