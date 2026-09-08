"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Building2, MapPin } from "lucide-react";
import type { DiscoveryResult } from "@/backend/core/types";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { formatMYR } from "@/lib/i18n/format";

function placementIdFor(advertisement: DiscoveryResult): string | null {
  return advertisement.sponsorship?.placementId ?? null;
}

export function SponsoredPartnerRail({ advertisements }: { advertisements: DiscoveryResult[] }) {
  const { t } = useTranslation("customer");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef(new Map<string, HTMLElement>());
  const impressedPlacementIds = useRef(new Set<string>());
  const [scrollControls, setScrollControls] = useState({
    canScrollBackward: false,
    canScrollForward: advertisements.length > 1,
  });

  const updateScrollControls = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maximumScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setScrollControls({
      canScrollBackward: viewport.scrollLeft > 1,
      canScrollForward: viewport.scrollLeft < maximumScrollLeft - 1,
    });
  }, []);

  const recordEvent = useCallback((advertisement: DiscoveryResult, eventType: "impression" | "click") => {
    const placementId = placementIdFor(advertisement);
    if (!placementId) return;

    void fetch(`/api/sponsored-placements/${placementId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, productId: advertisement.id }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const advertisementsByPlacement = new Map(
      advertisements.flatMap((advertisement) => {
        const placementId = placementIdFor(advertisement);
        return placementId ? [[placementId, advertisement] as const] : [];
      }),
    );
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const placementId = entry.target.getAttribute("data-placement-id");
        if (!placementId || impressedPlacementIds.current.has(placementId)) continue;
        const advertisement = advertisementsByPlacement.get(placementId);
        if (!advertisement) continue;

        impressedPlacementIds.current.add(placementId);
        recordEvent(advertisement, "impression");
      }
    }, { root: viewportRef.current, threshold: 0.5 });

    cardsRef.current.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [advertisements, recordEvent]);

  useEffect(() => {
    const timeoutId = setTimeout(updateScrollControls, 0);
    window.addEventListener("resize", updateScrollControls);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateScrollControls);
    };
  }, [advertisements, updateScrollControls]);

  if (advertisements.length === 0) return null;

  const scrollRail = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: viewport.clientWidth * 0.8 * direction, behavior: "smooth" });
  };

  return (
    <section className="border-b border-border bg-secondary/25" aria-labelledby="sponsored-partner-heading">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("ui.labels.sponsored")}</p>
            <h2 id="sponsored-partner-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
              {t("ui.search.sponsoredRecommendations")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.search.sponsoredDescription")}</p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <button
              type="button"
              aria-label={t("ui.search.previousAdvertisement")}
              disabled={!scrollControls.canScrollBackward}
              onClick={() => scrollRail(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("ui.search.nextAdvertisement")}
              disabled={!scrollControls.canScrollForward}
              onClick={() => scrollRail(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          data-testid="sponsored-partner-rail"
          onScroll={updateScrollControls}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:thin]"
        >
          {advertisements.map((advertisement) => {
            const placementId = placementIdFor(advertisement);
            if (!placementId) return null;
            const image = getPlaceActivityImage(advertisement);
            const location = [advertisement.outlet.city, advertisement.outlet.state].filter(Boolean).join(", ");
            const categoryKey = getOptionalDiscoveryCategoryLabelKey(advertisement.categorySlug);

            return (
              <article
                key={placementId}
                ref={(node) => {
                  if (node) cardsRef.current.set(placementId, node);
                  else cardsRef.current.delete(placementId);
                }}
                data-placement-id={placementId}
                className="group min-w-[300px] snap-start overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-[470px]"
              >
                <Link
                  href={`/customer/activity/${advertisement.id}`}
                  onClick={() => recordEvent(advertisement, "click")}
                  className="grid h-full grid-cols-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 sm:grid-cols-[44%_56%]"
                >
                  <div className="relative min-h-44 overflow-hidden bg-secondary sm:min-h-56">
                    {/* Product images come from the existing trusted activity image presenter. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt={advertisement.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                    <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950">
                      {t("ui.labels.sponsored")}
                    </span>
                    <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                      <MapPin size={13} aria-hidden="true" /> {location}
                    </span>
                  </div>
                  <div className="flex min-h-52 flex-col p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
                      {categoryKey ? t(categoryKey) : advertisement.category}
                    </p>
                    <h3 className="mt-2 line-clamp-2 font-[family-name:var(--font-display)] text-xl font-bold leading-6 text-foreground">
                      {advertisement.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{advertisement.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                        <Building2 size={14} className="shrink-0" aria-hidden="true" />
                        {t("ui.search.providedBy", { vendor: advertisement.outlet.vendorName })}
                      </span>
                      <span className="shrink-0 font-bold text-foreground">{formatMYR(Number(advertisement.price))}</span>
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-xs font-bold text-primary">
                      {t("ui.actions.viewDetails")} <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
