"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ArrowLeft, CalendarDays, Check, Clock, Map as MapIcon, MapPin, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Pagination } from "@/components/shared/pagination";
import { formatMYR } from "@/lib/i18n/format";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import {
  formatEventDateRange,
  formatEventHours,
  formatEventShortDateRange,
  getEventLocationPhase,
  getDefaultStopId,
  getEventOperationalLabelKey,
  PHASE_LABEL_KEY,
  type EventLocationPhase,
} from "@/lib/promotion-campaigns/locations";
import { isOptimizableImageUrl } from "@/lib/storage/optimizable-image";
import type { PromotionCampaignPublic, PromotionCampaignPublicStall, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";
import styles from "./promotion-campaign-detail.module.css";

type Props = {
  slug: string;
  initialCampaign: PromotionCampaignPublic | null;
  initialError: "load" | "missing" | null;
};

type StopStall = { vendor: PromotionCampaignPublicVendor; stall: PromotionCampaignPublicStall };

// 3 per row × 2 rows (approved layout); more stalls at one stop page through the shared pager.
const STALL_PAGE_SIZE = 6;
const MENU_PREVIEW_LINES = 2;

// The string of lights over the poster is decorative and static: a fixed viewBox scales it with the poster.
const FESTOON_WIDTH = 444;
const FESTOON_BULBS = Array.from({ length: 12 }, (_, index) => {
  const t = (index + 1) / 13;
  return { x: FESTOON_WIDTH * t, y: (1 - t) ** 2 * 6 + 2 * (1 - t) * t * 41 + t ** 2 * 6 };
});

function StatusLabel({ tone, children }: { tone: "running" | "upcoming" | "ended"; children: ReactNode }) {
  return <span className={styles.status} data-tone={tone}>{children}</span>;
}

function Festoon() {
  return (
    <svg className={styles.festoon} viewBox={`0 0 ${FESTOON_WIDTH} 46`} aria-hidden="true" focusable="false">
      <path className={styles.festoonWire} d={`M0,6 Q${FESTOON_WIDTH / 2},41 ${FESTOON_WIDTH},6`} />
      {FESTOON_BULBS.map(({ x, y }) => (
        <g key={x}>
          <rect className={styles.festoonSocket} x={x - 2} y={y} width="4" height="5" rx="1" />
          <circle className={styles.festoonGlow} cx={x} cy={y + 10} r="8" />
          <ellipse className={styles.festoonBulb} cx={x} cy={y + 10} rx="4" ry="5.5" />
        </g>
      ))}
    </svg>
  );
}

/** About text clamped to a few lines; Read more appears only when the text is actually cut off. */
function AboutBody({ text, control, isOpen, onToggle }: { text: string; control: ReactNode; isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation("customer");
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element || isOpen) return;
    const measure = () => setIsOverflowing(element.scrollHeight > element.clientHeight + 2);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, isOpen]);

  return (
    <>
      <p ref={textRef} id="campaign-about" className={styles.about} data-open={isOpen}>{text}</p>
      {control && <p className={styles.aboutControl}>{control}</p>}
      {(isOverflowing || isOpen) && (
        <button type="button" className={styles.moreButton} aria-expanded={isOpen} aria-controls="campaign-about" onClick={onToggle}>
          {t(isOpen ? "ui.promotionCampaigns.showLess" : "ui.promotionCampaigns.readMore")}
        </button>
      )}
    </>
  );
}

function StallBooth({ campaignSlug, entry, phase, locale }: { campaignSlug: string; entry: StopStall; phase: EventLocationPhase; locale: Parameters<typeof formatMYR>[1] }) {
  const { t } = useTranslation("customer");
  const { vendor, stall } = entry;
  return (
    <li className={styles.stall} data-phase={phase}>
      <div className={styles.awning} aria-hidden="true" />
      <div className={styles.booth}>
        <div className={styles.boothPhoto}>
          {stall.stallPosterUrl && (
            <Image
              src={stall.stallPosterUrl}
              alt=""
              fill
              sizes="(max-width: 900px) 50vw, 260px"
              unoptimized={!isOptimizableImageUrl(stall.stallPosterUrl)}
              className="object-cover"
            />
          )}
        </div>
        <Link href={`/customer/events/${encodeURIComponent(campaignSlug)}/${encodeURIComponent(vendor.vendorId)}?stop=${encodeURIComponent(stall.locationId)}`} className={styles.vendorLink}>
          {vendor.vendorName}
        </Link>
        {vendor.vendorKind === "event" && (
          <span className="inline-flex w-fit rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">{t("ui.eventPartners.badge")}</span>
        )}
        <span className={styles.itemCount}>{t("ui.promotionCampaigns.productCount", { count: stall.products.length })}</span>
      </div>
      {stall.products.length > 0 && (
        <ul className={styles.menu}>
          {stall.products.slice(0, MENU_PREVIEW_LINES).map((product) => (
            <li key={product.id}>
              <span>{product.name}</span>
              <i aria-hidden="true" />
              <b>{product.price === 0 ? t("ui.reserve.free") : formatMYR(product.price, locale)}</b>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function PromotionCampaignDetailClient({ slug, initialCampaign, initialError }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const searchParams = useSearchParams();
  const [campaign, setCampaign] = useState(initialCampaign);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"load" | "missing" | null>(initialError);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [stallPage, setStallPage] = useState(1);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const stallsRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const stepperRef = useRef<HTMLOListElement>(null);
  const pendingPageChange = useRef(false);

  const orderedLocations = useMemo(() => [...(campaign?.locations ?? [])].sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn) || a.opensAt.localeCompare(b.opensAt)), [campaign]);
  // Phases follow the clock; the server and the client may disagree only at a stop's closing minute.
  const phases = new Map(orderedLocations.map((location) => [location.id, getEventLocationPhase(location)]));
  const stallsByLocation = useMemo(() => {
    const grouped = new Map<string, StopStall[]>();
    for (const vendor of campaign?.vendors ?? []) {
      for (const stall of vendor.stalls) grouped.set(stall.locationId, [...(grouped.get(stall.locationId) ?? []), { vendor, stall }]);
    }
    for (const entries of grouped.values()) entries.sort((a, b) => a.vendor.vendorName.localeCompare(b.vendor.vendorName, locale));
    return grouped;
  }, [campaign, locale]);

  const urlStopId = searchParams?.get("stop") ?? null;
  const knownStop = (id: string | null) => (id && orderedLocations.some((location) => location.id === id) ? id : null);
  const activeStopId = knownStop(selectedStopId) ?? knownStop(urlStopId) ?? getDefaultStopId(orderedLocations, phases);
  const activeStop = orderedLocations.find((location) => location.id === activeStopId) ?? null;
  const activePhase = activeStop ? phases.get(activeStop.id) ?? "running" : "running";
  const stopStalls = activeStop ? stallsByLocation.get(activeStop.id) ?? [] : [];
  const totalStallPages = Math.ceil(stopStalls.length / STALL_PAGE_SIZE);
  const safeStallPage = Math.min(stallPage, Math.max(1, totalStallPages));
  const visibleStalls = stopStalls.slice((safeStallPage - 1) * STALL_PAGE_SIZE, safeStallPage * STALL_PAGE_SIZE);

  const selectStop = (id: string) => {
    setSelectedStopId(id);
    setStallPage(1);
    // Keep the stop in the URL so Back from a stall page returns here; replaceState adds no history entry.
    const url = new URL(window.location.href);
    url.searchParams.set("stop", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    // Scroll only the stepper so the chosen stop is fully visible; scrollIntoView could also move the page.
    const stepper = stepperRef.current;
    if (!stepper || !(stepper.scrollWidth > stepper.clientWidth)) return;
    const step = stepper.childNodes[orderedLocations.findIndex((location) => location.id === activeStopId)] as HTMLElement | undefined;
    if (!step) return;
    const { offsetLeft: left, offsetWidth: width } = step;
    if (left < stepper.scrollLeft) stepper.scrollLeft = left;
    else if (left + width > stepper.scrollLeft + stepper.clientWidth) stepper.scrollLeft = left + width - stepper.clientWidth;
  }, [activeStopId, orderedLocations]);

  const changeStallPage = (page: number) => {
    pendingPageChange.current = true;
    setStallPage(page);
  };

  useEffect(() => {
    if (!pendingPageChange.current) return;
    pendingPageChange.current = false;
    // The arrow just pressed may now be disabled (first/last page); keep focus inside the pager.
    if ((document.activeElement as HTMLButtonElement | null)?.disabled) {
      pagerRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }
    const grid = stallsRef.current;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--customer-header-h")) || 68;
    if (grid && grid.getBoundingClientRect().top < headerHeight) {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      grid.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [safeStallPage]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/customer/promotion-campaigns?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 404) { setCampaign(null); setError("missing"); return; }
      if (!response.ok || !payload.data?.campaign) throw new Error("campaign_unavailable");
      setCampaign(payload.data.campaign as PromotionCampaignPublic);
      setError(null);
    } catch {
      setCampaign(null);
      setError("load");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await load();
  }, [load]);
  const backAction = (
    <Button asChild variant="outline" className={`${styles.backButton} rounded-full`}>
      <BackLink fallbackHref="/customer/events"><ArrowLeft size={15} /> {t("actions.back", { ns: "common" })}</BackLink>
    </Button>
  );

  const campaignTone = campaign?.operationalStatus === "operating" || (!campaign?.operationalStatus && campaign?.visibility === "live") ? "running" : "upcoming";

  return (
    <CustomerPageShell wide>
      {campaign && <Breadcrumbs className="mb-4" label={t("ui.place.breadcrumb")} items={[
        { label: t("navigation.home"), href: "/customer" },
        { label: t("navigation.events"), href: "/customer/events" },
        { label: <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} /> },
      ]} />}
      {!campaign && <CustomerPageHeader
        title={t("ui.promotionCampaigns.detailTitle")}
        description={t("ui.promotionCampaigns.detailDescription")}
        className="mb-6 sm:mb-8"
        actions={backAction}
      />}
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p> : error ? (
        <div role="alert" className="rounded-3xl border border-border bg-card p-8 text-center"><CalendarDays size={28} className="mx-auto text-primary" /><h2 className="mt-3 font-bold text-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFound" : "ui.promotionCampaigns.loadError")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFoundDescription" : "ui.promotionCampaigns.tryAgainDescription")}</p><div className="mt-5 flex justify-center gap-2">{error === "load" && <Button variant="outline" className="rounded-full" onClick={() => void refresh()}><RefreshCw size={14} /> {t("ui.actions.retry")}</Button>}<Button asChild className="rounded-full"><Link href="/customer/events">{t("ui.promotionCampaigns.backToEvents")}</Link></Button></div></div>
      ) : campaign && (
        <div data-slot="campaign-layout" className={styles.layout}>
          <aside data-slot="campaign-overview" aria-labelledby="campaign-detail-title" className={styles.left} data-about-open={isAboutOpen}>
            {campaign.posterUrl && (
              <figure className={styles.poster}>
                <Festoon />
                <div className={styles.posterFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={campaign.posterUrl} alt={campaign.title} className={styles.posterImage} />
                </div>
              </figure>
            )}
            <p className={styles.eyebrow}>{t("ui.promotionCampaigns.eyebrow")}</p>
            <h1 id="campaign-detail-title" className={styles.title}>
              <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} />
            </h1>
            <p className={styles.meta}>
              <StatusLabel tone={campaignTone}>{t(getEventOperationalLabelKey(campaign))}</StatusLabel>
              <span>{formatEventDateRange(getMalaysiaDateInputValue(new Date(campaign.startsAt)), getMalaysiaDateInputValue(new Date(campaign.endsAt)), locale)}</span>
              {orderedLocations.length > 0 && (
                <span className={styles.metaCount}><MapIcon size={15} aria-hidden="true" />{t("ui.promotionCampaigns.locationCount", { count: orderedLocations.length })}</span>
              )}
            </p>
            {campaign.visibility === "upcoming" && <p className={styles.upcomingNotice}>{t("ui.promotionCampaigns.upcomingNotice")}</p>}
            {campaign.description.trim() && <>
              <hr className={styles.rule} />
              <h2 className={styles.aboutHeading}>{t("ui.promotionCampaigns.about")}</h2>
              <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="description" sourceText={campaign.description}>
                {({ text, control }) => <AboutBody text={text} control={control} isOpen={isAboutOpen} onToggle={() => setIsAboutOpen((open) => !open)} />}
              </LocalizedContent>
            </>}
          </aside>

          <section aria-labelledby="event-stops-heading" className={styles.right}>
            <h2 id="event-stops-heading" className={styles.stopsHeading}>
              {orderedLocations.length > 1 ? t("ui.promotionCampaigns.stops") : t("ui.promotionCampaigns.locationsSection", { count: 1 })}
            </h2>
            {orderedLocations.length > 1 && (
              <ol ref={stepperRef} data-slot="event-stops" className={styles.stepper} style={{ "--stops": orderedLocations.length } as CSSProperties}>
                {orderedLocations.map((location) => {
                  const phase = phases.get(location.id) ?? "running";
                  return (
                    <li key={location.id}>
                      <button type="button" className={styles.step} data-phase={phase} aria-pressed={location.id === activeStopId} onClick={() => selectStop(location.id)}>
                        <span className={styles.node} aria-hidden="true">{phase === "ended" ? <Check size={17} /> : <MapPin size={17} />}</span>
                        <span className={styles.stepWhen}>{formatEventShortDateRange(location.startsOn, location.endsOn, locale)}</span>
                        <span className={styles.stepName}>{location.name}</span>
                        <StatusLabel tone={phase}>{t(PHASE_LABEL_KEY[phase])}</StatusLabel>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {!activeStop ? (
              <p className={styles.empty}>{t("ui.promotionCampaigns.noVendors")}</p>
            ) : (
              <div data-slot="event-stop" className={styles.stop}>
                <h3 className={styles.stopName}>{activeStop.name}</h3>
                <ul className={styles.facts}>
                  <li><CalendarDays size={16} aria-hidden="true" />{formatEventDateRange(activeStop.startsOn, activeStop.endsOn, locale)}</li>
                  <li><Clock size={16} aria-hidden="true" />{formatEventHours(activeStop.opensAt, activeStop.closesAt, locale)}</li>
                  <li className={styles.address}><MapPin size={16} aria-hidden="true" />{activeStop.address ?? t("ui.promotionCampaigns.addressTba")}</li>
                </ul>
                <div ref={stallsRef} className={styles.stalls}>
                  {visibleStalls.length === 0 ? (
                    <p className={styles.empty}>{t("ui.promotionCampaigns.noStallsAtStop")}</p>
                  ) : (
                    <ul data-slot="event-stalls" className={styles.grid}>
                      {visibleStalls.map((entry) => (
                        <StallBooth key={entry.stall.registrationId} campaignSlug={campaign.slug} entry={entry} phase={activePhase} locale={locale} />
                      ))}
                    </ul>
                  )}
                  {stopStalls.length > STALL_PAGE_SIZE && (
                    <div ref={pagerRef}>
                      <Pagination
                        ariaLabel={t("ui.promotionCampaigns.stallPages")}
                        currentPage={safeStallPage}
                        onPageChange={changeStallPage}
                        pageSize={STALL_PAGE_SIZE}
                        totalItems={stopStalls.length}
                        totalPages={totalStallPages}
                        className={styles.pager}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </CustomerPageShell>
  );
}
