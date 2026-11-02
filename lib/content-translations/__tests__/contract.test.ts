import { describe, expect, it } from 'vitest';
import {
  isPublicTranslationField,
  isSupportedTranslationLocale,
  sourceAlreadyMatchesLocale,
} from '../contract';

describe('public content translation contract', () => {
  it('supports every site locale', () => {
    expect(['en', 'zh-CN', 'ms'].every(isSupportedTranslationLocale)).toBe(true);
    expect(isSupportedTranslationLocale('fr')).toBe(false);
  });

  it('allowlists only customer-visible fields for each entity type', () => {
    expect(isPublicTranslationField('product', 'description')).toBe(true);
    expect(isPublicTranslationField('review', 'body')).toBe(true);
    expect(isPublicTranslationField('review', 'authorName')).toBe(false);
    expect(isPublicTranslationField('review', 'user_id')).toBe(false);
    expect(isPublicTranslationField('promotion_campaign', 'summary')).toBe(true);
    expect(isPublicTranslationField('vendor_event_promotion', 'details')).toBe(true);
    expect(isPublicTranslationField('vendor_event_promotion', 'status')).toBe(false);
    expect(isPublicTranslationField('unknown', 'description')).toBe(false);
  });

  it('skips provider work when the selected locale matches detected source language', () => {
    expect(sourceAlreadyMatchesLocale('升旗山是一个热门景点', 'zh-CN')).toBe(true);
    expect(sourceAlreadyMatchesLocale('Saya suka berjalan di tempat ini', 'ms')).toBe(true);
    expect(sourceAlreadyMatchesLocale('Explore the historic square', 'en')).toBe(true);
    expect(sourceAlreadyMatchesLocale('Explore the historic square', 'zh-CN')).toBe(false);
  });
});
