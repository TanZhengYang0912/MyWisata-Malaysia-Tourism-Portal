import { z } from 'zod';

const optionalUrl = z.string().url().max(2000).optional().or(z.literal(''));

export const outletPageBlockTypes = [
  'intro',
  'text',
  'image',
  'image_text',
  'product_grid',
  'gallery',
  'hours',
  'contact',
  'voucher_banner',
  'cta',
  'review_highlight',
  'social_proof',
] as const;

export type OutletPageBlockType = typeof outletPageBlockTypes[number];

export interface OutletPageBlock {
  id: string;
  type: OutletPageBlockType;
  title?: string;
  body?: string;
  image?: string;
  imageUrl?: string;
  cta?: string;
  buttonLink?: string;
  productIds?: string[];
  style?: {
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    spacing?: 'compact' | 'medium' | 'large';
  };
}

export interface HeroBlock {
  id: string;
  type: 'hero';
  title: string;
  body: string;
  imageUrl?: string;
  cta?: string;
  buttonLink?: string;
  overlayOpacity?: number;
  imagePosition?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface GalleryItem {
  url: string;
  alt?: string;
}

export interface OutletPageDocument {
  version: number;
  hero: HeroBlock;
  blocks: OutletPageBlock[];
  gallery: GalleryItem[];
  brandColour: string;
  fontFamily: string;
  featuredIds: string[];
  seoTitle: string;
  seoDescription: string;
}

export interface LegacyOutletPageFields {
  hero_url?: unknown;
  brand_colour?: unknown;
  font_family?: unknown;
  featured_ids?: unknown;
  seo_title?: unknown;
  seo_description?: unknown;
  blocks?: unknown;
  gallery?: unknown;
}

const styleSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  spacing: z.enum(['compact', 'medium', 'large']).optional(),
}).strict().optional();

const blockSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(outletPageBlockTypes),
  title: z.string().max(255).optional(),
  body: z.string().max(2000).optional(),
  image: optionalUrl,
  imageUrl: optionalUrl,
  cta: z.string().max(120).optional(),
  buttonLink: z.string().max(500).optional(),
  productIds: z.array(z.string().uuid()).max(12).optional(),
  style: styleSchema,
}).strict();

const heroSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('hero'),
  title: z.string().max(255),
  body: z.string().max(2000),
  imageUrl: optionalUrl,
  cta: z.string().max(120).optional(),
  buttonLink: z.string().max(500).optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  imagePosition: z.string().max(80).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
});

const documentSchema = z.object({
  version: z.number().int().positive(),
  hero: heroSchema,
  blocks: z.array(blockSchema).max(30),
  gallery: z.array(z.object({ url: z.string().url().max(2000), alt: z.string().max(255).optional() }).strict()).max(50),
  brandColour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().trim().min(2).max(120),
  featuredIds: z.array(z.string().uuid()).max(12),
  seoTitle: z.string().max(255),
  seoDescription: z.string().max(500),
}).strict();

const DEFAULT_HERO_BODY = 'Discover local food, culture and experiences from this outlet.';

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function stableDefaultBlock(type: OutletPageBlockType, title: string): OutletPageBlock {
  return { id: `default-${type}`, type, title };
}

export function createOutletPageBlock(type: OutletPageBlockType, seed = Date.now()): OutletPageBlock {
  const titles: Record<OutletPageBlockType, string> = {
    intro: 'Welcome to this outlet',
    text: 'Tell travellers your story',
    image: 'Show the place',
    image_text: 'Image and story',
    product_grid: 'Featured experiences',
    gallery: 'A glimpse of the place',
    hours: 'Opening hours',
    contact: 'Find this outlet',
    voucher_banner: 'A special offer for travellers',
    cta: 'Ready to explore?',
    review_highlight: 'What guests say',
    social_proof: 'Trusted by travellers',
  };
  return { id: `${type}-${seed}-${Math.random().toString(36).slice(2, 6)}`, type, title: titles[type] };
}

export function createDefaultOutletPageDocument(outletName: string): OutletPageDocument {
  return {
    version: 1,
    hero: {
      id: 'hero',
      type: 'hero',
      title: outletName || 'Discover this outlet',
      body: DEFAULT_HERO_BODY,
      textAlign: 'left',
      overlayOpacity: 0.35,
      imagePosition: 'center',
    },
    blocks: [
      stableDefaultBlock('intro', 'Welcome to this outlet'),
      stableDefaultBlock('product_grid', 'Featured experiences'),
      stableDefaultBlock('gallery', 'A glimpse of the place'),
      stableDefaultBlock('hours', 'Opening hours'),
      stableDefaultBlock('contact', 'Find this outlet'),
      stableDefaultBlock('cta', 'Ready to explore?'),
    ],
    gallery: [],
    brandColour: '#00004D',
    fontFamily: 'Plus Jakarta Sans',
    featuredIds: [],
    seoTitle: outletName ? `${outletName} · Malaysia Tourism` : '',
    seoDescription: '',
  };
}

function normalizeBlock(value: unknown, index: number): OutletPageBlock | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const type = stringValue(source.type);
  if (type === 'hero' || !outletPageBlockTypes.includes(type as OutletPageBlockType)) return null;
  const block: OutletPageBlock = {
    id: stringValue(source.id, `block-${index + 1}`),
    type: type as OutletPageBlockType,
  };
  for (const key of ['title', 'body', 'image', 'imageUrl', 'cta', 'buttonLink'] as const) {
    if (typeof source[key] === 'string' && source[key]) block[key] = source[key] as string;
  }
  if (Array.isArray(source.productIds)) block.productIds = source.productIds.filter((id): id is string => typeof id === 'string').slice(0, 12);
  if (source.style && typeof source.style === 'object') block.style = source.style as OutletPageBlock['style'];
  return block;
}

export function normalizeOutletPageDocument(value: unknown, legacy?: LegacyOutletPageFields): OutletPageDocument {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const fallback = legacy || {};
  const defaults = createDefaultOutletPageDocument('');
  const sourceBlocks = arrayValue<unknown>(source.blocks ?? fallback.blocks);
  const legacyHero = sourceBlocks.find((block) => Boolean(block && typeof block === 'object' && (block as Record<string, unknown>).type === 'hero')) as Record<string, unknown> | undefined;
  const heroUrl = stringValue(source.hero_url ?? fallback.hero_url) || stringValue(legacyHero?.imageUrl ?? legacyHero?.image);
  const hero: HeroBlock = {
    ...defaults.hero,
    id: stringValue((source.hero as Record<string, unknown> | undefined)?.id ?? legacyHero?.id, 'hero'),
    title: stringValue((source.hero as Record<string, unknown> | undefined)?.title ?? legacyHero?.title, defaults.hero.title),
    body: stringValue((source.hero as Record<string, unknown> | undefined)?.body ?? legacyHero?.body, defaults.hero.body),
    imageUrl: heroUrl || undefined,
    cta: stringValue((source.hero as Record<string, unknown> | undefined)?.cta ?? legacyHero?.cta) || undefined,
    buttonLink: stringValue((source.hero as Record<string, unknown> | undefined)?.buttonLink) || undefined,
  };
  const blocks = sourceBlocks.map(normalizeBlock).filter((block): block is OutletPageBlock => Boolean(block));
  const gallerySource = arrayValue<unknown>(source.gallery ?? fallback.gallery);
  const gallery = gallerySource.map((item) => {
    if (typeof item === 'string') return { url: item };
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string') {
      return { url: (item as Record<string, unknown>).url as string, alt: stringValue((item as Record<string, unknown>).alt) || undefined };
    }
    return null;
  }).filter((item): item is GalleryItem => Boolean(item?.url)).slice(0, 50);
  const featuredSource = source.featuredIds ?? source.featured_ids ?? fallback.featured_ids;
  const featuredIds = arrayValue<unknown>(featuredSource).filter((id): id is string => typeof id === 'string').slice(0, 12);
  return {
    version: typeof source.version === 'number' && source.version > 0 ? source.version : 1,
    hero,
    blocks,
    gallery,
    brandColour: stringValue(source.brandColour ?? source.brand_colour ?? fallback.brand_colour, defaults.brandColour),
    fontFamily: stringValue(source.fontFamily ?? source.font_family ?? fallback.font_family, defaults.fontFamily),
    featuredIds,
    seoTitle: stringValue(source.seoTitle ?? source.seo_title ?? fallback.seo_title),
    seoDescription: stringValue(source.seoDescription ?? source.seo_description ?? fallback.seo_description),
  };
}

export function validateOutletPageDocument(value: unknown) {
  return documentSchema.safeParse(value);
}

export function documentToLegacyFields(document: OutletPageDocument): Record<string, unknown> {
  return {
    hero_url: document.hero.imageUrl || null,
    brand_colour: document.brandColour,
    font_family: document.fontFamily,
    featured_ids: document.featuredIds,
    seo_title: document.seoTitle || null,
    seo_description: document.seoDescription || null,
    blocks: [{ ...document.hero, image: document.hero.imageUrl }, ...document.blocks],
    gallery: document.gallery,
  };
}

export type OutletPageValidationResult = ReturnType<typeof validateOutletPageDocument>;
