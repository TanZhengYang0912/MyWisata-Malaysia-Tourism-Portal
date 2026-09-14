import crypto from "node:crypto";
import { buildVerifiedPlaceActivityMediaIndex } from "./verified-place-activity-media.mjs";

function stableUuid(value) {
  const hex = crypto.createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validHttps(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Converts hand-curated, source-backed place facts into database rows.
 * Deliberately has no database I/O so tests can reject a bad catalogue before
 * a guarded remote seed writes anything.
 */
export function buildVerifiedPlaceAccessPlan({ manifest, places, media }) {
  const mediaIndex = buildVerifiedPlaceActivityMediaIndex({ media });
  const issues = [...mediaIndex.issues];
  const rows = [];
  const activePoiBySlug = new Map(
    (places ?? [])
      .filter((place) => place.status === "active" && place.level === "poi")
      .map((place) => [place.slug, place]),
  );
  const placeBySlug = new Map((places ?? []).map((place) => [place.slug, place]));
  const seenSlugs = new Set();

  for (const access of manifest?.accesses ?? []) {
    const duplicate = seenSlugs.has(access.slug);
    if (duplicate) {
      issues.push({ code: "duplicate_access_slug", slug: access.slug });
    }
    seenSlugs.add(access.slug);
    let valid = !duplicate;
    if (!access.title?.trim() || !access.description?.trim() || !access.source_title?.trim()) {
      issues.push({ code: "missing_required_copy", slug: access.slug });
      valid = false;
    }
    if (!validHttps(access.source_url)) {
      issues.push({ code: "invalid_source_url", slug: access.slug });
      valid = false;
    }
    if (access.image_source_url && !validHttps(access.image_source_url)) {
      issues.push({ code: "invalid_image_source_url", slug: access.slug });
      valid = false;
    }
    const activityMedia = mediaIndex.byKey.get(mediaIndex.mediaKey("access", access.slug));
    if (!activityMedia) {
      issues.push({ code: "missing_activity_media", slug: access.slug });
      valid = false;
    }
    if (!["free_public_access", "free_activity"].includes(access.access_type)) {
      issues.push({ code: "invalid_access_type", slug: access.slug });
      valid = false;
    }
    const target = activePoiBySlug.get(access.place_slug);
    if (!target) {
      issues.push({
        code: placeBySlug.has(access.place_slug) ? "place_not_active_poi" : "place_not_found",
        placeSlug: access.place_slug,
      });
      valid = false;
    }
    if (!valid) continue;

    rows.push({
      id: stableUuid(`verified-place-access:${target.id}:${access.slug}`),
      place_id: target.id,
      slug: access.slug,
      title: access.title.trim(),
      description: access.description.trim(),
      access_type: access.access_type,
      source_title: access.source_title.trim(),
      source_url: access.source_url,
      image_source_url: activityMedia.source_page,
      image_path: activityMedia.asset_path,
      status: "active",
    });
  }

  return { rows, issues };
}
