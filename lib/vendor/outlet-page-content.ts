import {
  createDefaultOutletPageDocument,
  normalizeOutletPageDocument,
  type LegacyOutletPageFields,
  type OutletPageBlock,
  type OutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';

export interface OutletPageContentContext {
  outletName: string;
  vendorName?: string;
  vendorDescription?: string;
  city?: string;
  state?: string;
  productIds: string[];
  heroUrl?: string | null;
  galleryUrls?: string[];
}

export interface OutletPageSetupInput {
  hasAddress: boolean;
  hasLocation: boolean;
  hasHours: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasPage: boolean;
  hasHeroImage: boolean;
  hasGallery: boolean;
  sellableProductCount: number;
  bookableProductCount: number;
  bookableProductWithFutureSlotCount: number;
}

const GENERIC_HERO_TITLE = 'Discover this outlet';
const GENERIC_HERO_BODY = 'Discover local food, culture and experiences from this outlet.';

function localArea(context: OutletPageContentContext) {
  return [context.city, context.state].filter(Boolean).join(', ') || 'Malaysia';
}

function defaultIntroBody(context: OutletPageContentContext) {
  const partner = context.vendorName || 'our local partner';
  const description = context.vendorDescription || 'local favourites and thoughtful experiences';
  return `${partner} welcomes you to ${context.outletName} in ${localArea(context)}. Explore ${description} designed around this place.`;
}

function defaultBlock(type: OutletPageBlock['type'], title: string, body?: string): OutletPageBlock {
  return { id: `default-${type}`, type, title, ...(body ? { body } : {}) };
}

export function buildCompleteOutletPageDocument(
  source: unknown,
  context: OutletPageContentContext,
): OutletPageDocument {
  const document = normalizeOutletPageDocument(source);
  const defaults = createDefaultOutletPageDocument(context.outletName);
  const sourceObject = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const sourceHero = sourceObject.hero && typeof sourceObject.hero === 'object' ? sourceObject.hero as Record<string, unknown> : {};
  const sourceFeatured = Array.isArray(sourceObject.featuredIds)
    ? sourceObject.featuredIds
    : Array.isArray(sourceObject.featured_ids) ? sourceObject.featured_ids : [];
  const validProducts = new Set(context.productIds);
  const selectedFeatured = sourceFeatured.filter((id): id is string => typeof id === 'string' && validProducts.has(id));
  const featuredIds = selectedFeatured.length > 0 || sourceFeatured.length > 0
    ? selectedFeatured
    : context.productIds;
  const hasCustomHeroTitle = typeof sourceHero.title === 'string' && sourceHero.title.trim() && sourceHero.title !== GENERIC_HERO_TITLE;
  const hasCustomHeroBody = typeof sourceHero.body === 'string' && sourceHero.body.trim() && sourceHero.body !== GENERIC_HERO_BODY;
  const blocks = document.blocks.length > 0 ? [...document.blocks] : [...defaults.blocks];
  const introIndex = blocks.findIndex((block) => block.type === 'intro');
  if (introIndex >= 0) {
    const intro = blocks[introIndex];
    blocks[introIndex] = {
      ...intro,
      title: intro.title && intro.title !== 'Welcome to this outlet' ? intro.title : 'A local day, made memorable',
      body: intro.body || defaultIntroBody(context),
    };
  } else {
    blocks.unshift(defaultBlock('intro', 'A local day, made memorable', defaultIntroBody(context)));
  }
  if (!blocks.some((block) => block.type === 'product_grid')) {
    blocks.splice(1, 0, defaultBlock('product_grid', 'Featured from this outlet', 'Reserve a table, book an activity or shop a local favourite.'));
  }
  if (!blocks.some((block) => block.type === 'hours')) blocks.push(defaultBlock('hours', 'Opening hours'));
  if (!blocks.some((block) => block.type === 'contact')) blocks.push(defaultBlock('contact', 'Find this outlet'));

  return {
    ...document,
    hero: {
      ...document.hero,
      title: hasCustomHeroTitle ? document.hero.title : context.outletName || defaults.hero.title,
      body: hasCustomHeroBody ? document.hero.body : defaultIntroBody(context),
      imageUrl: document.hero.imageUrl || context.heroUrl || undefined,
    },
    blocks,
    featuredIds,
    gallery: document.gallery.length > 0
      ? document.gallery
      : (context.galleryUrls || []).filter(Boolean).map((url) => ({ url, alt: `${context.outletName} local experience` })),
    seoTitle: document.seoTitle || `${context.outletName} · Malaysia Tourism`,
    seoDescription: document.seoDescription || defaultIntroBody(context),
  };
}

export function getOutletPageSetupIssues(input: OutletPageSetupInput) {
  const issues: string[] = [];
  if (!input.hasAddress) issues.push('address');
  if (!input.hasLocation) issues.push('location');
  if (!input.hasHours) issues.push('hours');
  if (!input.hasPhone) issues.push('phone');
  if (!input.hasEmail) issues.push('email');
  if (!input.hasPage) issues.push('page');
  if (!input.hasHeroImage) issues.push('hero_image');
  if (!input.hasGallery) issues.push('gallery');
  if (input.sellableProductCount === 0) issues.push('products');
  if (input.bookableProductCount > input.bookableProductWithFutureSlotCount) issues.push('booking_slots');
  return issues;
}

export type OutletPageContentSource = LegacyOutletPageFields | Partial<OutletPageDocument>;
