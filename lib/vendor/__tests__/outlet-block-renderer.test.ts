import { describe, expect, it } from 'vitest';
import { getBlockRenderModel } from '@/components/outlet/outlet-block-renderer';

describe('outlet block render model', () => {
  it('uses Hero values from the document instead of hardcoded copy', () => {
    const model = getBlockRenderModel({
      id: 'hero-1',
      type: 'hero',
      title: 'Taste Johor',
      body: 'Local food',
      imageUrl: 'https://example.com/hero.jpg',
    });

    expect(model.title).toBe('Taste Johor');
    expect(model.body).toBe('Local food');
    expect(model.imageUrl).toBe('https://example.com/hero.jpg');
  });

  it('uses imageUrl for regular image blocks', () => {
    const model = getBlockRenderModel({
      id: 'image-1',
      type: 'image',
      title: 'Our kitchen',
      imageUrl: 'https://example.com/kitchen.jpg',
    });

    expect(model.imageUrl).toBe('https://example.com/kitchen.jpg');
  });
});
