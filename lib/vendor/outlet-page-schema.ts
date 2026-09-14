import { z } from 'zod';
import { GRID_COLS, fits, gridRowCount } from '@/lib/vendor/outlet-grid';

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

/** Size a block gets when first added, in grid cells. */
export const BLOCK_DEFAULT_SIZE: Record<OutletPageBlockType, [number, number]> = {
  intro: [4, 2],
  text: [3, 2],
  image: [2, 3],
  image_text: [4, 3],
  product_grid: [4, 3],
  gallery: [4, 3],
  hours: [2, 2],
  contact: [2, 2],
  voucher_banner: [4, 2],
  cta: [3, 2],
  review_highlight: [2, 2],
  social_proof: [2, 1],
};

/** Smallest size a block may be resized to before its content stops reading. */
export const BLOCK_MIN_SIZE: Record<OutletPageBlockType, [number, number]> = {
  intro: [2, 1],
  text: [2, 1],
  image: [2, 3],
  image_text: [4, 3],
  product_grid: [4, 3],
  gallery: [4, 3],
  hours: [2, 1],
  contact: [2, 1],
  voucher_banner: [2, 2],
  cta: [2, 2],
  review_highlight: [2, 1],
  social_proof: [1, 1],
};

/**
 * May `block` become `w × h` without running off the grid or overlapping a
 * sibling? The one check both the canvas's resize menu and the inspector's
 * size control must agree on — a block the schema would reject on save must
 * never be selectable in either UI.
 */
export function canResizeBlockTo(blocks: OutletPageBlock[], block: OutletPageBlock, w: number, h: number): boolean {
  const [minW, minH] = BLOCK_MIN_SIZE[block.type];
  if (w < minW || h < minH) return false;
  if (block.w === w && block.h === h) return w >= minW && h >= minH;
  const candidate = { x: block.x, y: block.y, w, h };
  return fits(blocks, candidate, GRID_COLS, gridRowCount([...blocks, candidate]), block.id);
}

/**
 * Vendor-typed values that replace live outlet data for one block. A key that
 * is absent means "use the outlet's own data" — an empty string is never
 * stored, the key is deleted instead.
 */
export interface OutletBlockOverrides {
  hours?: string;
  address?: string;
  phone?: string;
  review?: string;
}

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
  x: number;
  y: number;
  w: number;
  h: number;
  overrides?: OutletBlockOverrides;
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

const overridesSchema = z.object({
  hours: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(80).optional(),
  review: z.string().max(1000).optional(),
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
  x: z.number().int().min(0).max(GRID_COLS - 1),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(GRID_COLS),
  h: z.number().int().min(1),
  overrides: overridesSchema,
}).strict().superRefine((block, ctx) => {
  if (block.x + block.w > GRID_COLS) {
    ctx.addIssue({
      code: 'custom',
      message: `Block runs past the right edge of the ${GRID_COLS}-column grid`,
      path: ['w'],
    });
  }
});

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

function stableDefaultBlock(
  type: OutletPageBlockType,
  title: string,
  x: number,
  y: number,
  w: number,
  h: number,
): OutletPageBlock {
  return { id: `default-${type}`, type, title, x, y, w, h };
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
  const [w, h] = BLOCK_DEFAULT_SIZE[type];
  // x/y are placeholders — the builder places the block with firstFreeSlot.
  return { id: `${type}-${seed}-${Math.random().toString(36).slice(2, 6)}`, type, title: titles[type], x: 0, y: 0, w, h };
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
      stableDefaultBlock('intro', 'Welcome to this outlet', 0, 0, 8, 2),
      stableDefaultBlock('gallery', 'A glimpse of the place', 0, 2, 4, 3),
      stableDefaultBlock('cta', 'Ready to explore?', 4, 2, 4, 3),
      stableDefaultBlock('hours', 'Opening hours', 0, 5, 4, 2),
      stableDefaultBlock('contact', 'Find this outlet', 4, 5, 4, 2),
      stableDefaultBlock('product_grid', 'Featured experiences', 0, 7, 8, 3),
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
  const block = {
    id: stringValue(source.id, `block-${index + 1}`),
    type: type as OutletPageBlockType,
  } as OutletPageBlock;
  for (const key of ['title', 'body', 'image', 'imageUrl', 'cta', 'buttonLink'] as const) {
    if (typeof source[key] === 'string' && source[key]) block[key] = source[key] as string;
  }
  if (Array.isArray(source.productIds)) block.productIds = source.productIds.filter((id): id is string => typeof id === 'string').slice(0, 12);
  if (source.style && typeof source.style === 'object') block.style = source.style as OutletPageBlock['style'];
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) block[key] = value;
  }
  if (source.overrides && typeof source.overrides === 'object') {
    block.overrides = source.overrides as OutletBlockOverrides;
  }
  return block;
}

export function hasPlacement(block: OutletPageBlock): boolean {
  return [block.x, block.y, block.w, block.h].every((value) => typeof value === 'number')
    && block.w >= 1
    && block.h >= 1;
}

/**
 * Documents written before the grid have no coordinates. Stack those blocks
 * full-width in their stored order, below anything already placed — so an old
 * draft opens looking exactly like the vertical layout it was authored as.
 */
export function backfillPlacement(blocks: OutletPageBlock[]): OutletPageBlock[] {
  let nextY = blocks.reduce((low, block) => (hasPlacement(block) ? Math.max(low, block.y + block.h) : low), 0);
  return blocks.map((block) => {
    if (hasPlacement(block)) return block;
    const h = BLOCK_DEFAULT_SIZE[block.type][1];
    const placed = { ...block, x: 0, y: nextY, w: GRID_COLS, h };
    nextY += h;
    return placed;
  });
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
  const blocks = backfillPlacement(
    sourceBlocks.map(normalizeBlock).filter((block): block is OutletPageBlock => Boolean(block)),
  );
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
