import { describe, expect, it } from 'vitest';
import { buildCompleteOutletPageDocument, getOutletPageSetupIssues } from '@/lib/vendor/outlet-page-content';

const context = {
  outletName: 'Rasa Malaysia — Ipoh Old Town',
  vendorName: 'Rasa Malaysia Kitchen',
  vendorDescription: 'A local food and culture partner across Malaysia.',
  city: 'Ipoh',
  state: 'Perak',
  productIds: ['11111111-1111-4111-8111-111111111111'],
  heroUrl: 'https://images.example.com/ipoh.jpg',
  galleryUrls: ['https://images.example.com/ipoh-gallery.jpg'],
};

describe('complete outlet page content', () => {
  it('replaces generic legacy content with outlet-specific copy and media', () => {
    const document = buildCompleteOutletPageDocument({
      hero_url: null,
      blocks: [
        { id: 'intro', type: 'intro', title: 'Welcome to this outlet' },
        { id: 'products', type: 'product_grid', title: 'Featured experiences' },
      ],
      gallery: [],
      featured_ids: [],
    }, context);

    expect(document.hero.title).toBe(context.outletName);
    expect(document.hero.body).toContain(context.city);
    expect(document.hero.imageUrl).toBe(context.heroUrl);
    expect(document.featuredIds).toEqual(context.productIds);
    expect(document.gallery[0].url).toBe(context.galleryUrls[0]);
    expect(document.blocks.find((block) => block.type === 'intro')?.body).toContain(context.outletName);
    expect(document.blocks.some((block) => block.type === 'hours')).toBe(true);
    expect(document.blocks.some((block) => block.type === 'contact')).toBe(true);
  });

  it('preserves meaningful custom copy while filling missing required sections', () => {
    const document = buildCompleteOutletPageDocument({
      hero: { id: 'hero', type: 'hero', title: 'A weekend in Ipoh', body: 'Our guide picks for a slow Sunday.' },
      blocks: [{ id: 'story', type: 'text', title: 'Our story', body: 'Family recipes and local walks.' }],
      gallery: [{ url: 'https://images.example.com/custom.jpg', alt: 'Custom photo' }],
      featuredIds: ['22222222-2222-4222-8222-222222222222'],
    }, context);

    expect(document.hero.title).toBe('A weekend in Ipoh');
    expect(document.hero.body).toBe('Our guide picks for a slow Sunday.');
    expect(document.gallery).toEqual([{ url: 'https://images.example.com/custom.jpg', alt: 'Custom photo' }]);
    expect(document.featuredIds).toEqual([]);
    expect(document.blocks.find((block) => block.type === 'text')?.body).toBe('Family recipes and local walks.');
  });

  it('reports the setup gaps that would make a public outlet page unusable', () => {
    expect(getOutletPageSetupIssues({
      hasAddress: false,
      hasLocation: false,
      hasHours: false,
      hasPhone: false,
      hasEmail: false,
      hasPage: false,
      hasHeroImage: false,
      hasGallery: false,
      sellableProductCount: 0,
      bookableProductCount: 1,
      bookableProductWithFutureSlotCount: 0,
    })).toEqual(expect.arrayContaining([
      'address', 'location', 'hours', 'phone', 'email', 'page', 'hero_image', 'gallery', 'products', 'booking_slots',
    ]));
  });
});
