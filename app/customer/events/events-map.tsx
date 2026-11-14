"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { getStateFlagSrc } from "@/lib/demo-map/state-flags";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { buildEventStateBreakdown } from "@/lib/promotion-campaigns/event-state-counts";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { PromotionCampaignCard } from "./promotion-campaign-card";

function MapLoading() {
  const { t } = useTranslation("customer");
  return (
    <div className="flex h-[min(58svh,560px)] min-h-[360px] items-center justify-center rounded-[1.8rem] border border-primary/20 bg-secondary/70 text-sm font-semibold text-muted-foreground lg:h-[620px]" role="status">
      {t("ui.promotionCampaigns.map.loadingMap")}
    </div>
  );
}

const MyLawatanExploreMap = dynamic(
  () => import("@/components/demo-map/mylawatan-explore-map").then((module) => module.MyLawatanExploreMap),
  { ssr: false, loading: () => <MapLoading /> },
);

export function EventsMap({ campaigns }: { campaigns: PromotionCampaignPublic[] }) {
  const { t } = useTranslation("customer");
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const today = getMalaysiaDateInputValue();
  const breakdown = useMemo(() => buildEventStateBreakdown(campaigns, today), [campaigns, today]);
  const stateEventCounts = Object.fromEntries(
    DEMO_STATES.map((state) => [state.id, breakdown.campaignsByState[state.id]?.length ?? 0]),
  );
  const selectedState = DEMO_STATES.find((state) => state.id === selectedStateId) ?? null;
  const visibleCampaigns = selectedStateId
    ? breakdown.campaignsByState[selectedStateId] ?? []
    : breakdown.allCampaigns;
  const statesWithEvents = DEMO_STATES.filter((state) => stateEventCounts[state.id] > 0).length;

  return (
    <div className="space-y-6">
      <section aria-label={t("ui.promotionCampaigns.map.mapRegion")} className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.75fr)] xl:items-stretch">
        <div className="min-w-0">
          <MyLawatanExploreMap
            presentation="events"
            selectedStateId={selectedStateId}
            stateEventCounts={stateEventCounts}
            onSelectState={setSelectedStateId}
          />
        </div>

        <aside aria-label={t("ui.promotionCampaigns.map.stateCountsTitle")} className="flex min-h-[360px] flex-col rounded-[1.8rem] border border-border bg-card p-4 shadow-sm sm:p-5 lg:min-h-[620px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.promotionCampaigns.map.stateCountsEyebrow")}</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground">
                {selectedState?.name ?? t("ui.promotionCampaigns.map.allMalaysia")}
              </h2>
            </div>
            <div className="shrink-0 rounded-2xl bg-secondary px-3 py-2 text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.promotionCampaigns.map.activeStates")}</p>
              <p className="mt-0.5 text-lg font-extrabold leading-none text-primary">{statesWithEvents}<span className="ml-1 text-xs font-semibold text-muted-foreground">/ 16</span></p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-secondary px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.promotionCampaigns.map.totalEventsLabel")}</p>
              <p className="mt-1 text-xl font-extrabold leading-none text-primary">{breakdown.allCampaigns.length}</p>
            </div>
            <div className="rounded-2xl bg-secondary px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.promotionCampaigns.map.statesLabel")}</p>
              <p className="mt-1 text-xl font-extrabold leading-none text-primary">16</p>
            </div>
          </div>

          <button
            type="button"
            aria-pressed={selectedStateId === null}
            onClick={() => setSelectedStateId(null)}
            className={`mt-3 flex min-h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${selectedStateId === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-secondary"}`}
          >
            <span>{t("ui.promotionCampaigns.map.allMalaysia")}</span>
            <span>{breakdown.allCampaigns.length}</span>
          </button>

          <div className="mt-3 grid min-h-0 grid-cols-2 content-start gap-1 overflow-y-auto pr-1 lg:flex-1" role="group" aria-label={t("ui.promotionCampaigns.map.stateCountsTitle")}>
            {DEMO_STATES.map((state) => {
              const count = stateEventCounts[state.id];
              const selected = selectedStateId === state.id;
              return (
                <button
                  key={state.id}
                  type="button"
                  aria-label={t("ui.promotionCampaigns.map.stateCountLabel", { state: state.name, count })}
                  aria-pressed={selected}
                  onClick={() => setSelectedStateId(selected ? null : state.id)}
                  className={`flex min-h-7 min-w-0 items-center justify-between gap-2 rounded-xl border px-2 py-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${selected ? "border-primary bg-secondary text-primary shadow-sm" : "border-border/80 bg-background hover:border-primary/40 hover:bg-secondary/60"}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Image
                      src={getStateFlagSrc(state.id)}
                      alt=""
                      aria-hidden="true"
                      width={32}
                      height={16}
                      unoptimized
                      className="h-4 w-8 shrink-0 rounded-[2px] border border-border/70 bg-white dark:bg-card object-cover"
                    />
                    <span className="min-w-0 break-words text-[11px] font-semibold leading-tight">{state.name}</span>
                  </span>
                  <span className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-extrabold ${selected ? "bg-accent text-accent-foreground" : count > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {breakdown.unlocatedCampaigns.length > 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              {t("ui.promotionCampaigns.map.unlocatedCount", { count: breakdown.unlocatedCampaigns.length })}
            </p>
          )}
          <p className="mt-auto border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground">
            {t("ui.promotionCampaigns.map.multipleStatesNote")}
          </p>
        </aside>
      </section>

      <section aria-labelledby="events-map-results-title" className="rounded-[1.8rem] border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.promotionCampaigns.eyebrow")}</p>
            <h2 id="events-map-results-title" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground sm:text-3xl">
              {selectedState
                ? t("ui.promotionCampaigns.map.eventsInState", { state: selectedState.name })
                : t("ui.promotionCampaigns.map.eventsInMalaysia")}
            </h2>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
            {t("ui.promotionCampaigns.map.eventCount", { count: visibleCampaigns.length })}
          </span>
        </div>

        {visibleCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background px-5 py-10 text-center">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
              {selectedState
                ? t("ui.promotionCampaigns.map.emptyStateTitle", { state: selectedState.name })
                : t("ui.promotionCampaigns.map.emptyMalaysiaTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("ui.promotionCampaigns.map.emptyDescription")}</p>
          </div>
        ) : (
          <div className={`mt-4 grid gap-3 md:grid-cols-2 ${visibleCampaigns.length >= 3 ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
            {visibleCampaigns.map((campaign) => (
              <PromotionCampaignCard key={campaign.id} campaign={campaign} variant="compact" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
