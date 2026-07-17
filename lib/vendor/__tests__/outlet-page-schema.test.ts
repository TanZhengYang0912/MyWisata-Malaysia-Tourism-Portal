import { describe, expect, it } from 'vitest';
import {
  createDefaultOutletPageDocument,
  normalizeOutletPageDocument,
  validateOutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';

describe('outlet page document schema', () => {
  it('normalizes legacy blocks without losing Hero title or image', () => {
    const document = normalizeOutletPageDocument({
      blocks: [{ id: 'hero-1', type: 'hero', title: 'Taste Johor', body: 'Local food', image: 'https://example.com/hero.jpg' }],
      hero_url: 'https://example.com/hero.jpg',
    });

    expect(document.hero.title).toBe('Taste Johor');
    expect(document.hero.body).toBe('Local food');
    expect(document.hero.imageUrl).toBe('https://example.com/hero.jpg');
  });

  it('creates real default blocks for an empty page', () => {
    const document = createDefaultOutletPageDocument('City Square');

    expect(document.hero.title).toBe('City Square');
    expect(document.blocks.map((block) => block.type)).toEqual([
      'intro',
      'product_grid',
      'gallery',
      'hours',
      'contact',
      'cta',
    ]);
    expect(new Set(document.blocks.map((block) => block.id)).size).toBe(document.blocks.length);
  });

  it('rejects invalid page colours and malformed image URLs', () => {
    const document = createDefaultOutletPageDocument('City Square');
    const result = validateOutletPageDocument({
      ...document,
      brandColour: 'blue',
      hero: { ...document.hero, imageUrl: 'not-a-url' },
    });

    expect(result.success).toBe(false);
  });
});
