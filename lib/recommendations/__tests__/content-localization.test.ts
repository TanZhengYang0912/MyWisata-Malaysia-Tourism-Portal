import { describe, expect, it } from 'vitest';
import { buildTranslationPrompt, sourceHash } from '@/lib/recommendations/content-localization';

describe('recommendation content localization', () => {
  it('binds a draft hash to the exact source text', () => {
    expect(sourceHash('Ipoh Heritage Walk')).toHaveLength(64);
    expect(sourceHash('Ipoh Heritage Walk')).not.toBe(sourceHash('Ipoh heritage walk'));
  });

  it('redacts PII from the only user text sent to the AI provider', () => {
    const prompt = buildTranslationPrompt({
      field: 'description',
      sourceText: 'Call +6012-345 6789 or email vendor@example.com to book.',
      locale: 'zh-CN',
    });

    expect(prompt.user).toContain('[PHONE]');
    expect(prompt.user).toContain('[EMAIL]');
    expect(prompt.user).not.toContain('+6012-345 6789');
    expect(prompt.user).not.toContain('vendor@example.com');
    expect(prompt.system).toContain('registered and brand names');
  });

  it('redacts websites from the only user text sent to the AI provider', () => {
    const prompt = buildTranslationPrompt({
      field: 'description',
      sourceText: 'Browse https://vendor.example/menu or www.vendor.example for details.',
      locale: 'ms',
    });

    expect(prompt.user).toContain('[URL]');
    expect(prompt.user).not.toContain('vendor.example');
  });
});
