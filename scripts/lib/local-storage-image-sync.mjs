const SOURCE_ORIGIN = "https://ncdlaehknicabzjqskvk.supabase.co";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";
export const PUBLIC_IMAGE_BUCKET_IDS = Object.freeze([
  "avatars",
  "event-posters",
  "place-images",
  "product-images",
  "vendor-images",
]);
const PUBLIC_IMAGE_BUCKETS = new Set(PUBLIC_IMAGE_BUCKET_IDS);

function parseOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must contain only a project origin.`);
  }

  return url;
}

export function validateSyncEndpoints(sourceUrl, targetUrl) {
  const source = parseOrigin(sourceUrl, "Source URL");
  const target = parseOrigin(targetUrl, "Local target URL");

  if (source.origin !== SOURCE_ORIGIN) {
    throw new Error("Source must be the hosted FYP Supabase project.");
  }

  if (target.protocol !== "http:" || !LOCAL_HOSTS.has(target.hostname) || target.port !== LOCAL_PORT) {
    throw new Error("Target must be local Supabase on loopback port 54321.");
  }

  return { sourceOrigin: source.origin, targetOrigin: target.origin };
}

export function isEligibleImageBucket(bucket) {
  return bucket?.public === true && PUBLIC_IMAGE_BUCKETS.has(bucket.id);
}

export function isImageObject(object) {
  return object?.id !== null
    && object?.id !== undefined
    && typeof object?.metadata?.mimetype === "string"
    && /^image\/[a-z0-9.+-]+$/i.test(object.metadata.mimetype);
}

export function isSafeObjectPath(objectPath) {
  if (typeof objectPath !== "string" || !objectPath || objectPath.startsWith("/") || objectPath.includes("\\")) {
    return false;
  }

  return objectPath.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function normalizeEtag(etag) {
  return typeof etag === "string"
    ? etag.trim().replace(/^W\//i, "").replace(/^"|"$/g, "").toLowerCase()
    : "";
}

export function needsObjectRepair(remoteEtag, localProbe) {
  if (localProbe?.status === 404 || localProbe?.status === 500) return true;
  if (localProbe?.status !== 200 && localProbe?.status !== 206) {
    throw new Error(`Local Storage probe returned unexpected HTTP ${localProbe?.status ?? "unknown"}.`);
  }

  const expected = normalizeEtag(remoteEtag);
  const actual = normalizeEtag(localProbe.etag);
  return !expected || !actual || expected !== actual;
}
