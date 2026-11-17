"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Megaphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell, CustomerSectionHeader } from "@/components/customer/customer-page-shell";
import { EventCard } from "@/components/customer/event-card";
import { Pagination } from "@/components/shared/pagination";
import { EventsDateFilter, headingFor } from "./events-date-header";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { campaignRunsOn, getEventSessionOn } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = { initialCampaigns: PromotionCampaignPublic[]; initialError: boolean; initialDate?: string | null };

const PAGE_SIZE = 8;

/** Earliest stop start, or "" when the event has no stops. */
const firstStart = (campaign: PromotionCampaignPublic) => campaign.locations.reduce((first, location) => (!first || location.startsOn < first ? location.startsOn : first), "");

export function PromotionCampaignsClient({ initialCampaigns, initialError, initialDate = null }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [today] = useState(() => getMalaysiaDateInputValue());
  // A shared ?date= link opens on that day; a past day falls back to all events.
  const [date, setDate] = useState<string | null>(() => (initialDate && initialDate >= today ? initialDate : null));
  const [page, setPage] = useState(1);
  // The clock is read after mount so server and client markup agree; until then cards show no Open now.
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/customer/promotion-campaigns", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.data?.campaigns)) throw new Error("campaigns_unavailable");
      setCampaigns(payload.data.campaigns as PromotionCampaignPublic[]);
      setError(false);
    } catch {
      setCampaigns([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
  }, [load]);

  // Every event with a stop that has not ended, earliest start first. "Ended" is by date, so server and client agree.
  const upcomingCampaigns = useMemo(() => campaigns
    .filter((campaign) => campaign.locations.some((location) => location.endsOn >= today))
    .sort((left, right) => firstStart(left).localeCompare(firstStart(right)) || left.title.localeCompare(right.title)), [campaigns, today]);

  // ponytail: counts filter the in-memory list per day (about 35 days × events when the calendar opens); cache by day if the list grows.
  const countOn = useCallback((day: string) => upcomingCampaigns.filter((campaign) => campaignRunsOn(campaign, day)).length, [upcomingCampaigns]);

  // With a date: the events running that day, open now first, then by that day's opening time, then by title.
  const listed = date
    ? upcomingCampaigns
      .filter((campaign) => campaignRunsOn(campaign, date))
      .map((campaign) => ({ campaign, session: getEventSessionOn(campaign.locations, date, now ?? undefined) }))
      .sort((left, right) => (
        Number(right.session?.openNow === true) - Number(left.session?.openNow === true)
        || (left.session?.location.opensAt ?? "").localeCompare(right.session?.location.opensAt ?? "")
        || left.campaign.title.localeCompare(right.campaign.title)
      ))
      .map(({ campaign }) => campaign)
    : upcomingCampaigns;
  const totalPages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = listed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const browsing = !loading && !error && upcomingCampaigns.length > 0;

  const selectDate = (value: string | null) => {
    setDate(value);
    setPage(1);
    // Keep the day in the URL so a shared link opens on it; replaceState adds no history entry (as ?stop= on the event page).
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("date", value);
    else url.searchParams.delete("date");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <CustomerPageShell wide>
      <CustomerPageHeader
        eyebrow={t("ui.promotionCampaigns.eyebrow")}
        title={t("ui.promotionCampaigns.pageTitle")}
        icon={<Megaphone size={15} />}
        actions={browsing ? <EventsDateFilter date={date} today={today} countOn={countOn} onSelect={selectDate} /> : undefined}
      />
      {error && (
        <div role="alert" className="mb-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
          <p className="font-semibold text-foreground">{t("ui.promotionCampaigns.loadError")}</p>
          <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={() => void refresh()}>
            <RefreshCw size={14} /> {t("ui.actions.retry")}
          </Button>
        </div>
      )}
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p> : !error && upcomingCampaigns.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <CalendarDays size={30} className="mx-auto text-primary" />
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
            {t("ui.promotionCampaigns.emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {t("ui.promotionCampaigns.emptyDescription")}
          </p>
          <Button asChild variant="outline" className="mt-5 rounded-full">
            <Link href="/customer">{t("ui.promotionCampaigns.home")}</Link>
          </Button>
        </div>
      ) : error ? null : (
        <section aria-labelledby="events-list-heading">
          <CustomerSectionHeader
            id="events-list-heading"
            title={date ? headingFor(date, locale) : t("ui.promotionCampaigns.allEvents")}
            action={<p role="status" className="text-[13px] text-muted-foreground">{t("ui.promotionCampaigns.map.eventCount", { count: listed.length })}</p>}
          />
          {listed.length > 0 ? (
            <>
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                {visible.map((campaign) => <EventCard key={campaign.id} campaign={campaign} day={date} now={now} />)}
              </div>
              {totalPages > 1 && <Pagination ariaLabel={t("ui.promotionCampaigns.pageTitle")} currentPage={safePage} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={listed.length} totalPages={totalPages} />}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">{t("ui.promotionCampaigns.dateEmpty")}</p>
            </div>
          )}
        </section>
      )}
    </CustomerPageShell>
  );
}
