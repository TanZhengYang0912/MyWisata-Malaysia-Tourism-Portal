const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let configuredHost: string | null = null;
    try {
      configuredHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;
    } catch {
      configuredHost = null;
    }
    return !!configuredHost
      && url.hostname === configuredHost
      && !LOCAL_HOSTS.includes(configuredHost.replace(/^\[|\]$/g, ""));
  }

  return process.env.NODE_ENV === "development"
    && url.protocol === "http:"
    && url.hostname === "127.0.0.1"
    && url.port === "54321";
}
