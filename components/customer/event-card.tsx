"use client";

import { CalendarDays, Map as MapIcon, Tent } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardFrame, CardLocation, CardLocationStatus } from "@/components/customer/card-frame";
import { LocalizedContent } from "@/components/customer/localized-content";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { countLocationStalls, formatEventDateRange, formatEventHours, getEventSessionOn } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

/**
 * One event on the Events page (place layout: photo left from md up).
 * - With a `day`: the session running that day (dates, hours, place), then its stall count and, on today only,
 *   Open now / Closed now. Renders nothing when the event does not run that day.
 * - With no day (all events): the whole run, the number of stops, every stall, and Live now / Coming soon.
 * `now` is null until the page has mounted, so the server and client markup agree.
 */
export function EventCard({ campaign, day, now }: { campaign: PromotionCampaignPublic; day: string | null; now: Date | null }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const session = day ? getEventSessionOn(campaign.locations, day, now ?? undefined) : null;
  if (day && !session) return null;
  const location = session?.location;

  return (
    <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title}>
      {({ text, control }) => (
        <CardFrame
          layout="place"
          href={`/customer/events/${encodeURIComponent(campaign.slug)}`}
          imageUrl={campaign.posterUrl}
          imageAlt={campaign.title}
          fallback={
            <div role="img" aria-label={campaign.title} className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground/50">
              <CalendarDays size={72} strokeWidth={1} aria-hidden="true" />
            </div>
          }
          title={text}
          titleControl={control}
          info={location ? (
            <div className="flex flex-col gap-1.5">
              {/* Dates and hours on their own lines: real date ranges are long, and the closing time must stay visible. */}
              <span className="tabular-nums text-[11px] font-bold text-primary max-sm:text-[10px]">
                <span className="block truncate max-sm:whitespace-normal">{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                <span className="block truncate">{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
              </span>
              <CardLocation>{location.name}</CardLocation>
            </div>
          ) : (
            <EventRunInfo campaign={campaign} locale={locale} />
          )}
          footer={location ? (
            <div className="text-[13px] text-muted-foreground max-sm:text-[11px]">
              <CardLocationStatus
                location={t("ui.promotionCampaigns.stallCount", { count: countLocationStalls(campaign, location.id) })}
                icon={<Tent size={13} aria-hidden="true" />}
                open={session?.openNow}
                openLabel={t("ui.operatingHours.openNow")}
                closedLabel={t("ui.operatingHours.closedNow")}
              />
            </div>
          ) : (
            <EventRunStatus campaign={campaign} />
          )}
        />
      )}
    </LocalizedContent>
  );
}

// "Live now" is date-based (a stop runs today in Malaysia time), so server and client agree without a clock.
const isLiveToday = (campaign: PromotionCampaignPublic) => {
  const today = getMalaysiaDateInputValue();
  return campaign.locations.some((location) => location.startsOn <= today && today <= location.endsOn);
};

/** All-events card: the first stop's start to the last stop's end, then how many stops (a count of places: the Map icon). */
function EventRunInfo({ campaign, locale }: { campaign: PromotionCampaignPublic; locale: AppLocale }) {
  const { t } = useTranslation("customer");
  const starts = campaign.locations.map((location) => location.startsOn).sort();
  const ends = campaign.locations.map((location) => location.endsOn).sort();
  return (
    <div className="flex flex-col gap-1.5">
      {starts.length > 0 && <span className="block truncate tabular-nums text-[11px] font-bold text-primary max-sm:whitespace-normal max-sm:text-[10px]">{formatEventDateRange(starts[0], ends[ends.length - 1], locale)}</span>}
      <CardLocation icon={<MapIcon size={13} aria-hidden="true" />}>{t("ui.promotionCampaigns.locationCount", { count: campaign.locations.length })}</CardLocation>
    </div>
  );
}

/** All-events card footer: every approved stall over all stops, and Live now / Coming soon. */
function EventRunStatus({ campaign }: { campaign: PromotionCampaignPublic }) {
  const { t } = useTranslation("customer");
  const live = isLiveToday(campaign);
  const stalls = campaign.locations.reduce((total, location) => total + countLocationStalls(campaign, location.id), 0);
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 text-[13px] text-muted-foreground max-sm:gap-1 max-sm:text-[11px]">
      <CardLocation icon={<Tent size={13} aria-hidden="true" />}>{t("ui.promotionCampaigns.stallCount", { count: stalls })}</CardLocation>
      <span className={`shrink-0 whitespace-nowrap font-semibold ${live ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
        {t(live ? "ui.promotionCampaigns.live" : "ui.promotionCampaigns.upcoming")}
      </span>
    </div>
  );
}
