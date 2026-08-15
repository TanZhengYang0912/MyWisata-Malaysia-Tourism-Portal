import { describe, expect, it } from 'vitest';
import { getBlockRenderModel, resolveBlockContent } from '@/components/outlet/outlet-block-renderer';

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

describe('outlet block live data and overrides', () => {
  const outlet = {
    id: 'outlet-1',
    name: 'Chendul Queensbay',
    address: '12 Jalan Alor',
    city: 'George Town',
    state: 'Penang',
    phone: '+60 4-261 0000',
    operating_hours: { monday: { open: '09:00', close: '18:00' } },
  };

  it('uses live outlet data when no override is set', () => {
    const content = resolveBlockContent(
      { id: 'c', type: 'contact', x: 0, y: 0, w: 2, h: 2 },
      outlet,
    );

    expect(content.address).toBe('12 Jalan Alor');
    expect(content.phone).toBe('+60 4-261 0000');
    expect(content.hours).toContain('MON');
  });

  it('lets a per-block override win over live outlet data', () => {
    const content = resolveBlockContent(
      { id: 'c', type: 'contact', x: 0, y: 0, w: 2, h: 2, overrides: { address: 'Stall 4, Gurney Drive' } },
      outlet,
    );

    expect(content.address).toBe('Stall 4, Gurney Drive');
    expect(content.phone).toBe('+60 4-261 0000');
  });

  it('falls back to live data for an override that was cleared to an empty string', () => {
    const content = resolveBlockContent(
      { id: 'c', type: 'contact', x: 0, y: 0, w: 2, h: 2, overrides: { address: '' } },
      outlet,
    );

    expect(content.address).toBe('12 Jalan Alor');
  });

  it('falls back to the city and state when the outlet has no street address', () => {
    const content = resolveBlockContent(
      { id: 'c', type: 'contact', x: 0, y: 0, w: 2, h: 2 },
      { ...outlet, address: null },
    );

    expect(content.address).toBe('George Town, Penang');
  });
});
