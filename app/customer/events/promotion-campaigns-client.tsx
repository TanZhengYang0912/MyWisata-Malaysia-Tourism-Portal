"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, List, Map as MapIcon, Megaphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { EventCard } from "@/components/customer/event-card";
import { EventsDateHeader, SEE_MORE_TEXT } from "./events-date-header";
import { EventsMap } from "./events-map";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { campaignRunsOn, getEventSessionOn } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = { initialCampaigns: PromotionCampaignPublic[]; initialError: boolean };

const VIEWS = [
  { id: "list", icon: List },
  { id: "map", icon: MapIcon },
] as const;
type EventsView = (typeof VIEWS)[number]["id"];

export function PromotionCampaignsClient({ initialCampaigns, initialError }: Props) {
  const { t } = useTranslation("customer");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [view, setView] = useState<EventsView>("list");
  const [today] = useState(() => getMalaysiaDateInputValue());
  const [day, setDay] = useState(today);
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

  const sortedCampaigns = [...campaigns].sort((left, right) => {
    if (left.visibility !== right.visibility) return left.visibility === "live" ? -1 : 1;
    return left.visibility === "live"
      ? Date.parse(left.endsAt) - Date.parse(right.endsAt)
      : Date.parse(left.startsAt) - Date.parse(right.startsAt);
  });

  // Events running on the chosen day: open now first, then by that day's opening time, then by title.
  const campaignsOnDay = sortedCampaigns
    .filter((campaign) => campaignRunsOn(campaign, day))
    .map((campaign) => ({ campaign, session: getEventSessionOn(campaign.locations, day, now ?? undefined) }))
    .sort((left, right) => (
      Number(right.session?.openNow === true) - Number(left.session?.openNow === true)
      || (left.session?.location.opensAt ?? "").localeCompare(right.session?.location.opensAt ?? "")
      || left.campaign.title.localeCompare(right.campaign.title)
    ))
    .map(({ campaign }) => campaign);
  const browsing = !loading && !error && sortedCampaigns.length > 0;

  return (
    <CustomerPageShell wide>
      {browsing ? (
        <>
          <EventsDateHeader
            day={day}
            today={today}
            hasEvents={(value) => sortedCampaigns.some((campaign) => campaignRunsOn(campaign, value))}
            onSelect={setDay}
          />
          <div className="mb-5 mt-4 flex items-center justify-between gap-3">
            <p role="status" className="text-[13px] text-muted-foreground">{t("ui.promotionCampaigns.map.eventCount", { count: campaignsOnDay.length })}</p>
            <div role="group" aria-label={t("ui.promotionCampaigns.views.label")} className="inline-flex rounded-full border border-border bg-card p-1">
              {VIEWS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${view === id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon size={15} aria-hidden="true" /> {t(`ui.promotionCampaigns.views.${id}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <CustomerPageHeader
          eyebrow={t("ui.promotionCampaigns.eyebrow")}
          title={t("ui.promotionCampaigns.pageTitle")}
          icon={<Megaphone size={15} />}
        />
      )}
      {error && (
        <div role="alert" className="mb-6 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
          <p className="font-semibold text-foreground">{t("ui.promotionCampaigns.loadError")}</p>
          <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={() => void refresh()}>
            <RefreshCw size={14} /> {t("ui.actions.retry")}
          </Button>
        </div>
      )}
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p> : !error && sortedCampaigns.length === 0 ? (
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
      ) : error ? null : view === "map" ? <EventsMap campaigns={campaignsOnDay} />
        : campaignsOnDay.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {campaignsOnDay.map((campaign) => <EventCard key={campaign.id} campaign={campaign} day={day} now={now} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">{t("ui.promotionCampaigns.dateEmpty")}</p>
            {day !== today && <button type="button" onClick={() => setDay(today)} className={`${SEE_MORE_TEXT} mt-2`}>{t("ui.promotionCampaigns.datePicker.backToToday")}</button>}
          </div>
        )}
    </CustomerPageShell>
  );
}
