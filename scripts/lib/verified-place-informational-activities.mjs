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

/** Converts official, non-commerce attraction facts into safe database rows. */
export function buildVerifiedPlaceInformationalActivityPlan({ manifest, places, media }) {
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

  for (const activity of manifest?.activities ?? []) {
    const duplicate = seenSlugs.has(activity.slug);
    if (duplicate) issues.push({ code: "duplicate_activity_slug", slug: activity.slug });
    seenSlugs.add(activity.slug);

    let valid = !duplicate;
    if (!activity.title?.trim() || !activity.description?.trim() || !activity.source_title?.trim()) {
      issues.push({ code: "missing_required_copy", slug: activity.slug });
      valid = false;
    }
    if (!["informational_activity", "informational_paid_activity"].includes(activity.activity_type)) {
      issues.push({ code: "invalid_activity_type", slug: activity.slug });
      valid = false;
    }
    if (activity.activity_type === "informational_paid_activity" && !activity.price_label?.trim()) {
      issues.push({ code: "missing_price_label", slug: activity.slug });
      valid = false;
    }
    if (!validHttps(activity.source_url)) {
      issues.push({ code: "invalid_source_url", slug: activity.slug });
      valid = false;
    }
    if (activity.image_source_url && !validHttps(activity.image_source_url)) {
      issues.push({ code: "invalid_image_source_url", slug: activity.slug });
      valid = false;
    }
    const activityMedia = mediaIndex.byKey.get(mediaIndex.mediaKey("informational", activity.slug));
    if (!activityMedia) {
      issues.push({ code: "missing_activity_media", slug: activity.slug });
      valid = false;
    }
    const target = activePoiBySlug.get(activity.place_slug);
    if (!target) {
      issues.push({
        code: placeBySlug.has(activity.place_slug) ? "place_not_active_poi" : "place_not_found",
        placeSlug: activity.place_slug,
      });
      valid = false;
    }
    if (!valid) continue;

    rows.push({
      id: stableUuid(`verified-place-informational-activity:${target.id}:${activity.slug}`),
      place_id: target.id,
      slug: activity.slug,
      title: activity.title.trim(),
      description: activity.description.trim(),
      activity_type: activity.activity_type,
      price_label: activity.price_label?.trim() || null,
      source_title: activity.source_title.trim(),
      source_url: activity.source_url,
      image_source_url: activityMedia.source_page,
      image_path: activityMedia.asset_path,
      status: "active",
    });
  }

  return { rows, issues };
}
