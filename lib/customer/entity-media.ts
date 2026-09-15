import type { GalleryItem } from "@/lib/vendor/outlet-page-schema";
import { vendorImageUrl } from "@/lib/storage/vendor-image";

export type EntityMediaRow = {
  url: string;
  altText?: string | null;
  mediaType?: string | null;
  sortOrder?: number | null;
  contentHash?: string | null;
};

/**
 * Keep public entity galleries deterministic: gallery media only, ordered by
 * the owner's sort order, with duplicate URLs removed before rendering.
 */
export function selectEntityGallery(rows: readonly EntityMediaRow[], minimum = 0): GalleryItem[] {
  const seen = new Set<string>();
  const gallery = [...rows]
    .filter((row) => (row.mediaType === "gallery" || row.mediaType === "image") && row.sortOrder !== -1 && !row.altText?.toLowerCase().includes(" logo") && row.url.trim())
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .filter((row) => {
      const url = row.url.trim();
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((row) => ({ url: vendorImageUrl(row.url.trim()) || row.url.trim(), ...(row.altText?.trim() ? { alt: row.altText.trim() } : {}) }));

  return gallery.length >= minimum ? gallery : [];
}

export function selectEntityLogo(rows: readonly EntityMediaRow[]): string | null {
  return [...rows]
    .filter((row) => (row.mediaType === "logo" || (row.mediaType === "image" && row.sortOrder === -1)) && row.url.trim())
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map((row) => vendorImageUrl(row.url.trim()) || row.url.trim())
    .find(Boolean) ?? null;
}

/** A gallery is valid only when every slide has a non-empty content hash. */
export function hasUniqueGalleryContent(rows: readonly EntityMediaRow[]): boolean {
  const galleryRows = rows.filter((row) => (row.mediaType === "gallery" || row.mediaType === "image") && row.sortOrder !== -1 && !row.altText?.toLowerCase().includes(" logo"));
  if (!galleryRows.length) return true;
  const hashes = galleryRows.map((row) => row.contentHash?.trim() || null);
  return hashes.every(Boolean) && new Set(hashes).size === hashes.length;
}
