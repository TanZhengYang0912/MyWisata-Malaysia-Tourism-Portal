import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync('components/vendor/register-vendor-form.tsx', 'utf8');

describe('vendor registration section help', () => {
  it('puts section explanations behind keyboard-operable help summaries', () => {
    expect(form).toContain('<details');
    expect(form).toContain('<summary');
    expect(form).toContain('CircleHelp');
    expect(form).toContain("t('registration.sections.businessProfileDescription')");
    expect(form).toContain("t('registration.sections.legalContactDescription')");
    expect(form).toContain("t('registration.sections.brandAssetsDescription')");
  });

  it('provides clear explanations in every supported locale', () => {
    for (const locale of ['en', 'ms', 'zh-CN']) {
      const translations = JSON.parse(readFileSync(`app/i18n/locales/${locale}/vendor.json`, 'utf8'));
      const sections = translations.registration.sections;

      expect(sections.businessProfileHelpLabel).toBeTruthy();
      expect(sections.businessProfileDescription).toBeTruthy();
      expect(sections.legalContactHelpLabel).toBeTruthy();
      expect(sections.legalContactDescription).toBeTruthy();
      expect(sections.brandAssetsHelpLabel).toBeTruthy();
      expect(sections.brandAssetsDescription).toBeTruthy();
    }
  });

  it('uses the searchable country-code phone input and associates its instructions', () => {
    const phoneField = form.slice(form.indexOf('htmlFor="contact-phone"'), form.indexOf('htmlFor="business-email"'));
    expect(phoneField).toContain('<Controller');
    expect(phoneField).toContain('<InternationalPhoneInput');
    expect(phoneField).toContain('onBlur={field.onBlur}');
    expect(phoneField).toContain('ariaDescribedBy');
    expect(phoneField).toContain("t('registration.phoneHint'");

    for (const locale of ['en', 'ms', 'zh-CN']) {
      const translations = JSON.parse(readFileSync(`app/i18n/locales/${locale}/vendor.json`, 'utf8'));
      expect(translations.registration.phoneHint).toContain('12 345 6789');
      expect(translations.registration.phoneHint).toContain('012 345 6789');
      expect(translations.registration.phoneHint).toContain('+60');
      expect(translations.registration.placeholders.contactPhone).toBeUndefined();
    }
  });
});
