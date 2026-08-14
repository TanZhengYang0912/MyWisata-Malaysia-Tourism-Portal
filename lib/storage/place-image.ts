const BUCKET = "place-images";

// Transitional shim: rows written before
// 20260815101000_place_images_rewrite_urls.sql still carry this prefix.
// Keeping it means Task 4 and Task 5 can land in either order and a
// migration rollback does not break rendering. Safe to delete once the
// rewrite migration is confirmed applied in every environment.
const LEGACY_PREFIX = "/assets/customer/";

/**
 * Converts a bucket-relative place-image path into a public URL.
 * Returns null for empty input; passes absolute URLs through unchanged.
 */
export function placeImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  let objectPath = path.startsWith(LEGACY_PREFIX) ? path.slice(LEGACY_PREFIX.length) : path;
  objectPath = objectPath.replace(/^\/+/, "");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
