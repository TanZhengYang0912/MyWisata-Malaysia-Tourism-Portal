"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { ComputedActivity } from "@/backend/core/types";
import { buildPromotionSpotlight } from "@/lib/customer/promotion-spotlight";

const ACCENT_STYLES = {
  yellow: { badge: "bg-[#FFCC00] text-[#010066]", button: "bg-white text-[#010066] hover:bg-[#FFCC00]" },
  teal: { badge: "bg-[#EEF2FF] text-[#010066]", button: "bg-white text-[#010066] hover:bg-[#FFCC00]" },
  coral: { badge: "bg-[#FFB7A5] text-[#5B1D18]", button: "bg-white text-[#5B1D18] hover:bg-[#FFB7A5]" },
} as const;

export function PromotionSpotlight({ activities }: { activities: ComputedActivity[] }) {
  const { t } = useTranslation("customer");
  const promotions = useMemo(() => buildPromotionSpotlight(activities), [activities]);
  const [activeIndex, setActiveIndex] = useState(0);

  if (promotions.length === 0) return null;

  const selectedIndex = activeIndex % promotions.length;
  const active = promotions[selectedIndex];
  const accent = ACCENT_STYLES[active.accent];

  function move(direction: -1 | 1) {
    setActiveIndex((index) => (index + direction + promotions.length) % promotions.length);
  }

  return (
    <section aria-labelledby="promotion-spotlight-title" className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#010066] shadow-[0_18px_50px_rgba(1,0,102,0.18)]">
        {active.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#010066] via-[#010066]/90 to-[#1D2A8A]/60" />
        <div className="grid min-h-[250px] gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-end lg:p-12">
          <div className="max-w-2xl text-white">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#FFCC00]">
              <Sparkles size={15} />
              {t("ui.labels.trending")}
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black tracking-[0.16em] ${accent.badge}`}>
              {active.eyebrow}
            </span>
            <h2 id="promotion-spotlight-title" className="mt-4 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
              {active.title}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/80 sm:text-base">{active.description}</p>
            <Link href={active.href} className={`mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${accent.button}`}>
              {active.ctaLabel} <ChevronRight size={16} />
            </Link>
          </div>

          <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end">
            <div className="flex items-center gap-2">
              {promotions.map((promotion, index) => (
                <button
                  key={promotion.activityId}
                  type="button"
                  aria-label={`${t("ui.actions.viewDetails")} ${index + 1}`}
                  aria-current={index === selectedIndex ? "true" : undefined}
                  onClick={() => setActiveIndex(index)}
                  className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-8 bg-[#FFCC00]" : "w-2 bg-white/50 hover:bg-white"}`}
                />
              ))}
            </div>
            {promotions.length > 1 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => move(-1)} aria-label={t("ui.promotion.previous")} className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/10"><ChevronLeft size={17} /></button>
                <button type="button" onClick={() => move(1)} aria-label={t("ui.promotion.next")} className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/10"><ChevronRight size={17} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
