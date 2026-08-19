const BUCKET = "place-images";

// Transitional shim: the 14+ per-state seed migrations under
// supabase/migrations/*_place_images.sql still write this old prefix when
// replayed from scratch (e.g. `supabase db reset`). Keeps those working
// until the places_image_url_relative CHECK constraint makes the new
// bucket-relative convention permanent, at which point this can be dropped.
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
