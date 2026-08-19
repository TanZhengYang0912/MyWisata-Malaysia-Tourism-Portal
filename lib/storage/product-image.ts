const BUCKET = "product-images";

// Transitional shim: legacy SQL seed files wrote this old prefix before the migration
// to bucket-relative paths. We slice it off to maintain compatibility.
const LEGACY_PREFIX = "/assets/customer/products/";

/**
 * Converts a bucket-relative product-image path into a public URL.
 * Returns null for empty input; passes absolute URLs through unchanged.
 */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  let objectPath = path.startsWith(LEGACY_PREFIX) ? path.slice(LEGACY_PREFIX.length) : path;
  objectPath = objectPath.replace(/^\/+/, "");

  if (!objectPath.includes("/")) {
    objectPath = `products/${objectPath}`;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
