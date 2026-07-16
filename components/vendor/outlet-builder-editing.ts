import {
  normalizeOutletPageDocument,
  type OutletPageBlock,
  type OutletPageDocument,
} from '@/lib/vendor/outlet-page-schema';

export const OUTLET_BUILDER_AUTOSAVE_DELAY_MS = 8000;

export type InlineEditTarget =
  | { scope: 'hero'; field: 'title' | 'body'; value: string }
  | { scope: 'block'; blockId: string; field: 'title' | 'body' | 'imageUrl'; value: string };

export interface LocalOutletBuilderDraft {
  document: OutletPageDocument;
  draftVersion: number;
  updatedAt: number;
  pending: boolean;
}

export function updateOutletPageInlineText(
  document: OutletPageDocument,
  target: InlineEditTarget,
): OutletPageDocument {
  if (target.scope === 'hero') {
    return {
      ...document,
      hero: { ...document.hero, [target.field]: target.value },
    };
  }

  return {
    ...document,
    blocks: document.blocks.map((block: OutletPageBlock) =>
      block.id === target.blockId
        ? { ...block, [target.field]: target.value || undefined }
        : block,
    ),
  };
}

export function getOutletBuilderDraftStorageKey(
  vendorId: string,
  outletId: string,
) {
  return `outlet-studio-draft:${encodeURIComponent(vendorId)}:${encodeURIComponent(outletId)}`;
}

export function serializeOutletBuilderLocalDraft(
  document: OutletPageDocument,
  draftVersion: number,
  updatedAt = Date.now(),
  pending = true,
) {
  return JSON.stringify({ document, draftVersion, updatedAt, pending });
}

export function parseOutletBuilderLocalDraft(
  raw: string | null,
): LocalOutletBuilderDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.document || typeof parsed.document !== 'object') return null;
    if (typeof parsed.draftVersion !== 'number' || typeof parsed.updatedAt !== 'number') return null;
    return {
      document: normalizeOutletPageDocument(parsed.document),
      draftVersion: parsed.draftVersion,
      updatedAt: parsed.updatedAt,
      pending: parsed.pending !== false,
    };
  } catch {
    return null;
  }
}

export function getOutletBuilderMediaUrls(document: OutletPageDocument) {
  const urls = [
    document.hero.imageUrl,
    ...document.gallery.map((item) => item.url),
    ...document.blocks.flatMap((block) => [block.imageUrl, block.image]),
  ];

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}
