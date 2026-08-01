import { activityBody } from "./activity-body";
import { foodBody } from "./food-body";
import { retailBody } from "./retail-body";
import { stayBody } from "./stay-body";
import type { DetailBody } from "./types";

export type { DetailBody, DetailBodyProps } from "./types";

const DETAIL_BODIES: Record<string, DetailBody> = {
  food: foodBody,
  activity: activityBody,
  accommodation: stayBody,
  retail: retailBody,
};

/**
 * An unknown or missing categorySlug falls back to the activity body, which is
 * how the page behaved before it was split — so a product that predates the
 * taxonomy still renders rather than blanking.
 */
export function getDetailBody(categorySlug?: string | null): DetailBody {
  return DETAIL_BODIES[categorySlug ?? ""] ?? activityBody;
}
