import type { ImageLoader } from "next/image";

const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";
const RENDER_STORAGE_PATH = "/storage/v1/render/image/public/";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
// Supabase rejects transformation widths above 2500; it never enlarges a smaller original.
const MAX_RENDER_WIDTH = 2500;

function configuredSupabaseHost(): string | null {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supabaseUrl ? new URL(supabaseUrl).hostname : null;
  } catch {
    return null;
  }
}

/**
 * Serves a public Storage object through Supabase's image resizer, cached at Supabase's CDN, instead of
 * resizing it on our server at /_next/image. `resize=contain` keeps the proportions: with a width alone the
 * resizer keeps the original height and crops (a 960x1707 photo at width 640 came back 640x1707).
 */
export const supabaseImageLoader: ImageLoader = ({ src, width, quality }) => {
  const url = new URL(src);
  url.pathname = RENDER_STORAGE_PATH + url.pathname.slice(PUBLIC_STORAGE_PATH.length);
  url.searchParams.set("width", String(Math.min(width, MAX_RENDER_WIDTH)));
  url.searchParams.set("quality", String(quality ?? 75));
  url.searchParams.set("resize", "contain");
  return url.toString();
};

/**
 * The Supabase loader for public Storage objects of this project only (transformations are billed per
 * source image, so other projects' URLs keep Next's resizer); undefined otherwise, which keeps
 * next/image's default /_next/image loader. Local Supabase has no resizer enabled (supabase/config.toml).
 */
export function storageImageLoader(src: string | null | undefined): ImageLoader | undefined {
  if (!src) return undefined;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }
  const host = configuredSupabaseHost();
  return url.protocol === "https:"
    && !!host
    && url.hostname === host
    && !LOCAL_HOSTS.includes(host.replace(/^\[|\]$/g, ""))
    && url.pathname.startsWith(PUBLIC_STORAGE_PATH)
    ? supabaseImageLoader
    : undefined;
}

/** True when next/image may optimize this src under next.config.ts supabaseStorageRemotePattern() and localPatterns; keep the two in sync. */
export function isOptimizableImageUrl(src: string | null | undefined): boolean {
  if (!src) return false;
  // localPatterns `{ pathname: '**', search: '' }`: same-origin paths without a query.
  if (src.startsWith("/") && !src.startsWith("//")) return !src.includes("?");

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (!url.pathname.startsWith(PUBLIC_STORAGE_PATH)) return false;

  if (url.protocol === "https:") {
    // next.config.ts matches `*.supabase.co` as a single subdomain label.
    if (/^[^.]+\.supabase\.co$/.test(url.hostname)) return true;
    const configuredHost = configuredSupabaseHost();
    return !!configuredHost
      && url.hostname === configuredHost
      && !LOCAL_HOSTS.includes(configuredHost.replace(/^\[|\]$/g, ""));
  }

  return process.env.NODE_ENV === "development"
    && url.protocol === "http:"
    && url.hostname === "127.0.0.1"
    && url.port === "54321";
}
