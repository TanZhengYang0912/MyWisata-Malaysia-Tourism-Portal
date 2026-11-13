import { formatDate } from "@/lib/i18n/format";
import type { AppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation } from "./types";
import { addMalaysiaCalendarDays, getMalaysiaDateTimeLocalValue } from "@/lib/datetime/date-input";
import { malaysiaDateTimeLocalToIso } from "@/lib/datetime/malaysia";

export type AdminEventScheduleStatus = 'unconfigured' | 'upcoming' | 'operating' | 'between_sessions' | 'ended';
export function getAdminEventScheduleStatus(campaign: { starts_at: string; ends_at: string; locations?: { status?: string; starts_on: string; ends_on: string; opens_at: string; closes_at: string }[] }, now = new Date()): AdminEventScheduleStatus {
  if (Date.parse(campaign.ends_at) <= now.getTime()) return 'ended';
  const active = (campaign.locations ?? []).filter(location => location.status !== 'cancelled');
  if (!active.length) return 'unconfigured';
  const local = getMalaysiaDateTimeLocalValue(now), day = local.slice(0, 10), time = local.slice(11, 16);
  const windows = active.map(location => ({ location,
    start: Date.parse(malaysiaDateTimeLocalToIso(`${location.starts_on}T${location.opens_at.slice(0, 5)}`)),
    end: Date.parse(malaysiaDateTimeLocalToIso(`${location.ends_on}T${location.closes_at.slice(0, 5)}`)),
  }));
  if (windows.every(window => window.end <= now.getTime())) return 'ended';
  if (Date.parse(campaign.starts_at) > now.getTime() || windows.every(window => window.start > now.getTime())) return 'upcoming';
  return active.some(location => day >= location.starts_on && day <= location.ends_on && time >= location.opens_at.slice(0, 5) && time < location.closes_at.slice(0, 5)) ? 'operating' : 'between_sessions';
}

/** The session a visitor can go to next: today's if it has not closed yet, otherwise the earliest upcoming one. */
export function getNextEventSession(locations: PromotionCampaignPublicLocation[], now = new Date()): { location: PromotionCampaignPublicLocation; date: string; openNow: boolean } | null {
  const local = getMalaysiaDateTimeLocalValue(now), day = local.slice(0, 10), time = local.slice(11, 16);
  const tomorrow = addMalaysiaCalendarDays(day, 1);
  let next: { location: PromotionCampaignPublicLocation; date: string; openNow: boolean } | null = null;
  for (const location of locations) {
    const opens = location.opensAt.slice(0, 5), closes = location.closesAt.slice(0, 5);
    let candidate: { date: string; openNow: boolean } | null = null;
    if (day < location.startsOn) candidate = { date: location.startsOn, openNow: false };
    else if (day <= location.endsOn && time < closes) candidate = { date: day, openNow: time >= opens };
    else if (day <= location.endsOn && tomorrow <= location.endsOn) candidate = { date: tomorrow, openNow: false };
    if (candidate && (!next || `${candidate.date}T${opens}` < `${next.date}T${next.location.opensAt.slice(0, 5)}`)) next = { location, ...candidate };
  }
  return next;
}

/** True when any location runs on `day` (YYYY-MM-DD, Malaysia date). */
export function campaignRunsOn(campaign: Pick<PromotionCampaignPublic, "locations">, day: string): boolean {
  return campaign.locations.some((location) => location.startsOn <= day && day <= location.endsOn);
}

/** The session to show for `day`: among locations running that day, the one open now (today only), else the
 * first that has not closed yet today, else the earliest opening. openNow is only set when `day` is today in `now`. */
export function getEventSessionOn(locations: PromotionCampaignPublicLocation[], day: string, now?: Date): { location: PromotionCampaignPublicLocation; openNow?: boolean } | null {
  const running = locations
    .filter((location) => location.startsOn <= day && day <= location.endsOn)
    .sort((a, b) => a.opensAt.slice(0, 5).localeCompare(b.opensAt.slice(0, 5)));
  if (!running.length) return null;
  const local = now ? getMalaysiaDateTimeLocalValue(now) : null;
  if (!local || local.slice(0, 10) !== day) return { location: running[0] };
  const time = local.slice(11, 16);
  const open = running.find((location) => location.opensAt.slice(0, 5) <= time && time < location.closesAt.slice(0, 5));
  if (open) return { location: open, openNow: true };
  return { location: running.find((location) => time < location.closesAt.slice(0, 5)) ?? running[0], openNow: false };
}

/** Approved stalls at one location (each vendor stall whose locationId matches). */
export function countLocationStalls(campaign: Pick<PromotionCampaignPublic, "vendors">, locationId: string): number {
  return campaign.vendors.reduce((count, vendor) => count + vendor.stalls.filter((stall) => stall.locationId === locationId).length, 0);
}

export function getEventOperationalLabelKey(campaign: Pick<PromotionCampaignPublic, "visibility" | "operationalStatus">): string {
  if (campaign.operationalStatus === "between_sessions") return "ui.promotionCampaigns.betweenSessions";
  if (campaign.operationalStatus === "operating") return "ui.promotionCampaigns.operating";
  if (campaign.operationalStatus === "upcoming") return "ui.promotionCampaigns.upcoming";
  return campaign.visibility === "live" ? "ui.promotionCampaigns.live" : "ui.promotionCampaigns.upcoming";
}

// Location dates are plain calendar dates (YYYY-MM-DD) and hours are plain
// wall-clock times (HH:MM), both already in Malaysia time. Formatting them in
// UTC stops the browser's own timezone from shifting the day or hour.

export function formatEventDate(isoDate: string, locale: AppLocale): string {
  return formatDate(`${isoDate}T00:00:00Z`, locale, { timeZone: "UTC" });
}

export function formatEventDateRange(startsOn: string, endsOn: string, locale: AppLocale): string {
  return startsOn === endsOn
    ? formatEventDate(startsOn, locale)
    : `${formatEventDate(startsOn, locale)} – ${formatEventDate(endsOn, locale)}`;
}

export function formatEventTime(hhmm: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(`1970-01-01T${hhmm.slice(0, 5)}:00Z`));
}

export function formatEventHours(opensAt: string, closesAt: string, locale: AppLocale): string {
  return `${formatEventTime(opensAt, locale)} – ${formatEventTime(closesAt, locale)}`;
}
