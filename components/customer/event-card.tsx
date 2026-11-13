"use client";

import { CalendarDays, Tent } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardFrame, CardLocation, CardLocationStatus } from "@/components/customer/card-frame";
import { LocalizedContent } from "@/components/customer/localized-content";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { countLocationStalls, formatEventDateRange, formatEventHours, getEventSessionOn } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

/**
 * One event on the Events page for a chosen day: the session running that day (dates, hours, place), then its
 * stall count and, on today only, Open now / Closed now. Renders nothing when the event does not run that day.
 * `now` is null until the page has mounted, so the server and client markup agree.
 */
export function EventCard({ campaign, day, now }: { campaign: PromotionCampaignPublic; day: string; now: Date | null }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const session = getEventSessionOn(campaign.locations, day, now ?? undefined);
  if (!session) return null;
  const { location } = session;

  return (
    <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title}>
      {({ text, control }) => (
        <CardFrame
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
          info={
            <div className="flex flex-col gap-1.5">
              {/* Dates and hours on their own lines: real date ranges are long, and the closing time must stay visible. */}
              <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary max-sm:text-[10px]">
                <span className="block truncate max-sm:whitespace-normal">{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                <span className="block truncate">{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
              </span>
              <CardLocation>{location.name}</CardLocation>
            </div>
          }
          footer={
            <div className="text-[13px] text-muted-foreground max-sm:text-[11px]">
              <CardLocationStatus
                location={t("ui.promotionCampaigns.stallCount", { count: countLocationStalls(campaign, location.id) })}
                icon={<Tent size={13} aria-hidden="true" />}
                open={session.openNow}
                openLabel={t("ui.operatingHours.openNow")}
                closedLabel={t("ui.operatingHours.closedNow")}
              />
            </div>
          }
        />
      )}
    </LocalizedContent>
  );
}
