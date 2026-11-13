"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CalendarDays, List, Map as MapIcon, Megaphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { PromotionCampaignCard } from "./promotion-campaign-card";
import { EventsMap } from "./events-map";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = { initialCampaigns: PromotionCampaignPublic[]; initialError: boolean };

const VIEWS = [
  { id: "map", icon: MapIcon },
  { id: "list", icon: List },
  { id: "calendar", icon: CalendarDays },
] as const;
type EventsView = (typeof VIEWS)[number]["id"];

function ViewLoading() {
  const { t } = useTranslation("customer");
  return <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p>;
}

// FullCalendar and the map are heavy — load them only when their view is opened.
const EventsCalendar = dynamic(() => import("./events-calendar").then((m) => m.EventsCalendar), { ssr: false, loading: () => <ViewLoading /> });

export function PromotionCampaignsClient({ initialCampaigns, initialError }: Props) {
  const { t } = useTranslation("customer");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [view, setView] = useState<EventsView>("map");

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

  return (
    <CustomerPageShell wide>
      <CustomerPageHeader
        eyebrow={t("ui.promotionCampaigns.eyebrow")}
        title={t("ui.promotionCampaigns.pageTitle")}
        icon={<Megaphone size={15} />}
        actions={!loading && !error && sortedCampaigns.length > 0 ? (
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
        ) : undefined}
      />
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
      ) : !error && view === "calendar" ? <EventsCalendar campaigns={sortedCampaigns} />
        : !error && view === "map" ? <EventsMap campaigns={sortedCampaigns} />
        : !error && <div className="space-y-16">{sortedCampaigns.map((campaign) => <PromotionCampaignCard key={campaign.id} campaign={campaign} />)}</div>}
    </CustomerPageShell>
  );
}
