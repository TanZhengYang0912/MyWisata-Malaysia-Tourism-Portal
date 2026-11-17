import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('native Auth email templates', () => {
  const kinds = ['confirmation','recovery','magic_link','invite','reauthentication','email_change'];
  it.each(kinds)('%s is English only and keeps the existing Auth tokens', kind => {
    const html = readFileSync(`supabase/templates/${kind}.html`, 'utf8');
    expect(html).not.toContain('preferred_locale');
    expect(html).not.toMatch(/lang="(zh-CN|ms)"/);
    expect(html).toContain('lang="en"');
    expect(html).toContain('{{ .Token }}');
    if (kind !== 'reauthentication') expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).not.toMatch(/https:\/\/(?:api\.openai|generativelanguage)/);
  });

  it('uses plain English subjects', () => {
    const manifest = readFileSync('supabase/templates/manifest.json', 'utf8');
    expect(manifest).not.toContain('preferred_locale');
    expect(manifest).not.toContain('{{ if');
    expect(JSON.parse(manifest).mailer_subjects_confirmation).toBe('Confirm your email address');
  });
});
