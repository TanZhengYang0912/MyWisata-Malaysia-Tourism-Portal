import { describe, expect, it } from 'vitest';
import { buildTranslationPrompt, sourceHash } from '@/lib/recommendations/content-localization';

describe('recommendation content localization', () => {
  it('binds a draft hash to the exact source text', () => {
    expect(sourceHash('Ipoh Heritage Walk')).toHaveLength(64);
    expect(sourceHash('Ipoh Heritage Walk')).not.toBe(sourceHash('Ipoh heritage walk'));
  });

  it('refuses translation prompts containing personal contact details', () => {
    expect(() => buildTranslationPrompt({
      field: 'description',
      sourceText: 'Call +6012-345 6789 or email vendor@example.com to book.',
      locale: 'zh-CN',
    })).toThrow('sensitive_data_detected');
  });

  it('redacts public websites from the translation prompt', () => {
    const prompt = buildTranslationPrompt({
      field: 'description',
      sourceText: 'Browse https://vendor.example/menu or www.vendor.example for details.',
      locale: 'ms',
    });

    expect(prompt.user).toContain('[URL]');
    expect(prompt.user).not.toContain('vendor.example');
  });

  it('uses English when translating supported public-content fields to English', () => {
    const prompt = buildTranslationPrompt({
      field: 'tagline',
      sourceText: 'A welcoming coastal retreat.',
      locale: 'en',
    });

    expect(prompt.user).toContain('Translate this tagline into English.');
  });

  it('builds prompts for review fields and the English target locale', () => {
    const prompt = buildTranslationPrompt({
      field: 'body',
      sourceText: '这段评论很好',
      locale: 'en',
    });

    expect(prompt.user).toContain('this body into English');
    expect(prompt.system).toContain('plain text');
  });
});
