import { describe, expect, it } from 'vitest';
import {
  BLOCK_DEFAULT_SIZE,
  createDefaultOutletPageDocument,
  normalizeOutletPageDocument,
  validateOutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';
import { GRID_COLS } from '@/lib/vendor/outlet-grid';

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
      'cta',
      'hours',
      'contact',
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

  it('gives every default block a non-overlapping in-bounds placement', () => {
    const document = createDefaultOutletPageDocument('City Square');

    for (const block of document.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(0);
      expect(block.y).toBeGreaterThanOrEqual(0);
      expect(block.x + block.w).toBeLessThanOrEqual(GRID_COLS);
      expect(block.h).toBeGreaterThanOrEqual(1);
    }

    for (const a of document.blocks) {
      for (const b of document.blocks) {
        if (a.id === b.id) continue;
        const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('back-fills coordinates for legacy blocks as a full-width stack in order', () => {
    const document = normalizeOutletPageDocument({
      blocks: [
        { id: 'a', type: 'text', title: 'First' },
        { id: 'b', type: 'contact', title: 'Second' },
      ],
    });

    expect(document.blocks.map((block) => block.id)).toEqual(['a', 'b']);
    expect(document.blocks[0]).toMatchObject({ x: 0, y: 0, w: GRID_COLS, h: BLOCK_DEFAULT_SIZE.text[1] });
    expect(document.blocks[1]).toMatchObject({ x: 0, y: BLOCK_DEFAULT_SIZE.text[1], w: GRID_COLS });
  });

  it('keeps coordinates that are already present and stacks only the ones missing them', () => {
    const document = normalizeOutletPageDocument({
      blocks: [
        { id: 'a', type: 'text', title: 'Placed', x: 0, y: 0, w: 4, h: 2 },
        { id: 'b', type: 'cta', title: 'Legacy' },
      ],
    });

    expect(document.blocks[0]).toMatchObject({ x: 0, y: 0, w: 4, h: 2 });
    expect(document.blocks[1].y).toBe(2);
    expect(document.blocks[1].w).toBe(GRID_COLS);
  });

  it('rejects placements that run past the right edge of the grid', () => {
    const document = createDefaultOutletPageDocument('City Square');
    const result = validateOutletPageDocument({
      ...document,
      blocks: [{ ...document.blocks[0], x: 6, w: 4 }],
    });

    expect(result.success).toBe(false);
  });

  it('round-trips per-block overrides through validation', () => {
    const document = createDefaultOutletPageDocument('City Square');
    const result = validateOutletPageDocument({
      ...document,
      blocks: document.blocks.map((block) =>
        block.type === 'contact' ? { ...block, overrides: { phone: '+60 4-261 0000' } } : block,
      ),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const contact = result.data.blocks.find((block) => block.type === 'contact');
      expect(contact?.overrides).toEqual({ phone: '+60 4-261 0000' });
    }
  });
});
