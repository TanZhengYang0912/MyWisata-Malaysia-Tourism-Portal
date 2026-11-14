"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ArrowLeft, CalendarDays, ChevronDown, Clock, MapPin, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Pagination } from "@/components/shared/pagination";
import { PromotionCampaignVendorCard } from "@/components/customer/promotion-campaign-vendor-card";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatEventDateRange, formatEventHours, getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import styles from "./promotion-campaign-detail.module.css";

type Props = {
  slug: string;
  initialCampaign: PromotionCampaignPublic | null;
  initialError: "load" | "missing" | null;
};

const VENDOR_PAGE_SIZE = 12;

export function PromotionCampaignDetailClient({ slug, initialCampaign, initialError }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaign, setCampaign] = useState(initialCampaign);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"load" | "missing" | null>(initialError);
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorPage, setVendorPage] = useState(1);

  const stallCount = campaign?.vendors.reduce((total, vendor) => total + vendor.stalls.length, 0) ?? 0;
  const isOperating = campaign?.operationalStatus
    ? campaign.operationalStatus === "operating"
    : campaign?.visibility === "live";
  const filteredVendors = useMemo(() => {
    if (!campaign) return [];
    const normalizedQuery = vendorQuery.trim().toLocaleLowerCase(locale);
    if (!normalizedQuery) return campaign.vendors;

    return campaign.vendors.filter((vendor) =>
      vendor.vendorName.toLocaleLowerCase(locale).includes(normalizedQuery)
      || vendor.stalls.some((stall) => stall.stallNumber.toLocaleLowerCase(locale).includes(normalizedQuery)),
    );
  }, [campaign, locale, vendorQuery]);
  const totalVendorPages = Math.ceil(filteredVendors.length / VENDOR_PAGE_SIZE);
  const safeVendorPage = Math.min(vendorPage, Math.max(1, totalVendorPages));
  const visibleVendors = filteredVendors.slice(
    (safeVendorPage - 1) * VENDOR_PAGE_SIZE,
    safeVendorPage * VENDOR_PAGE_SIZE,
  );
  const normalizedVendorQuery = vendorQuery.trim().toLocaleLowerCase(locale);
  const visibleVendorCards = visibleVendors.map((vendor) => ({
    vendor,
    matchingStallNumbers: normalizedVendorQuery
      ? [...new Set(vendor.stalls
        .filter((stall) => stall.stallNumber.toLocaleLowerCase(locale).includes(normalizedVendorQuery))
        .map((stall) => stall.stallNumber))]
      : [],
  }));
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
      ) : campaign && <>
        <div data-slot="campaign-page-heading">
          <CustomerPageHeader
            title={<span id="campaign-detail-title"><LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} /></span>}
            className={styles.eventHeader}
            actions={backAction}
          />
        </div>
        <section data-slot="campaign-overview" aria-labelledby="campaign-detail-title" className={styles.eventOverview}>
          <div className={`${styles.overviewGrid}${campaign.posterUrl ? ` ${styles.overviewGridWithPoster}` : ""}`}>
            {campaign.posterUrl && (
              <figure className={styles.posterFrame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={campaign.posterUrl} alt={campaign.title} className={styles.posterImage} />
              </figure>
            )}
            <div className={`${styles.campaignInfo}${campaign.posterUrl ? "" : ` ${styles.campaignInfoWithoutPoster}`}`}>
              <p className={`${styles.status} ${isOperating ? styles.statusOperating : styles.statusUpcoming}`}>
                <span aria-hidden="true" className={styles.statusDot} />
                {t(getEventOperationalLabelKey(campaign))}
              </p>
              <div className={styles.campaignDates}>
                <p className={styles.campaignDate}>
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{t("ui.promotionCampaigns.startsAt", {
                    date: (isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime)(campaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" }),
                  })}</span>
                </p>
                <p className={styles.campaignDate}>
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{t("ui.promotionCampaigns.endsAt", {
                    date: (isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime)(campaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" }),
                  })}</span>
                </p>
              </div>
              {campaign.visibility === "upcoming" && (
                <p className={styles.upcomingNotice}>{t("ui.promotionCampaigns.upcomingNotice")}</p>
              )}
            </div>
          </div>
        </section>
        {campaign.locations.length > 0 && (
          <section aria-labelledby="event-locations-heading" className={styles.programSection}>
            <h2 id="event-locations-heading" className={styles.programHeading}>
              {t("ui.promotionCampaigns.locationsSection", { count: campaign.locations.length })}
            </h2>
            <ul data-slot="event-program" className={styles.programList}>
              {campaign.locations.map((location) => (
                <li key={location.id} data-slot="event-program-row" className={styles.programStop}>
                  <p data-slot="event-location-date" className={styles.locationDate}>
                    <CalendarDays size={15} aria-hidden="true" />
                    <span>{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                  </p>
                  <div className={styles.locationDetails}>
                    <h3 data-slot="event-location-name" className={styles.locationName}><MapPin size={16} aria-hidden="true" />{location.name}</h3>
                    <p className={styles.locationAddress}>{location.address ?? t("ui.promotionCampaigns.addressTba")}</p>
                  </div>
                  <p className={styles.locationHours}><Clock size={15} aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <details className={styles.campaignDetails}>
          <summary className={styles.detailsSummary}>
            <span>{t("ui.promotionCampaigns.campaignDetails")}</span>
            <ChevronDown size={16} aria-hidden="true" className={styles.detailsChevron} />
          </summary>
          <p className={styles.detailsBody}>
            <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="description" sourceText={campaign.description} />
          </p>
        </details>
        <section aria-labelledby="event-vendors-heading" className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 id="event-vendors-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground sm:text-3xl">
                {t("ui.promotionCampaigns.vendorsSection")}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>{t("ui.promotionCampaigns.vendorCount", { count: campaign.vendors.length })}</span>
                <span aria-hidden="true" className="text-border">·</span>
                <span>{t("ui.promotionCampaigns.stallCount", { count: stallCount })}</span>
              </p>
            </div>
            {(campaign.vendors.length > 1 || stallCount > 1) && (
              <label className="relative block w-full sm:max-w-xs">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={vendorQuery}
                  onChange={(event) => {
                    setVendorQuery(event.target.value);
                    setVendorPage(1);
                  }}
                  aria-label={t("ui.promotionCampaigns.searchVendorsOrStalls")}
                  placeholder={t("ui.promotionCampaigns.searchVendorsOrStalls")}
                  className="h-11 rounded-full border-border bg-card pl-10"
                />
              </label>
            )}
          </div>

          {visibleVendors.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center text-sm text-muted-foreground">
              {vendorQuery.trim() ? t("ui.promotionCampaigns.noVendorSearchResults") : t("ui.promotionCampaigns.noVendors")}
            </p>
          ) : campaign.vendors.length === 1 ? (
            <div className={styles.vendorLineup}>
              <div className="grid min-w-0 gap-4">
                {visibleVendorCards.map(({ vendor, matchingStallNumbers }) => <PromotionCampaignVendorCard key={vendor.vendorId} vendor={vendor} campaignSlug={campaign.slug} layout="featured" matchingStallNumbers={matchingStallNumbers} />)}
              </div>
            </div>
          ) : (
            <div className={styles.vendorLineup}>
              <div className={`grid min-w-0 gap-4 md:grid-cols-2${visibleVendorCards.length === 4 ? " xl:grid-cols-4" : visibleVendorCards.length > 2 ? " xl:grid-cols-3" : ""}`}>
                {visibleVendorCards.map(({ vendor, matchingStallNumbers }) => <PromotionCampaignVendorCard key={vendor.vendorId} vendor={vendor} campaignSlug={campaign.slug} matchingStallNumbers={matchingStallNumbers} />)}
              </div>
            </div>
          )}

          <Pagination
            ariaLabel={t("ui.promotionCampaigns.vendorPages")}
            currentPage={safeVendorPage}
            onPageChange={setVendorPage}
            pageSize={VENDOR_PAGE_SIZE}
            totalItems={filteredVendors.length}
            totalPages={totalVendorPages}
          />
        </section>
      </>}
    </CustomerPageShell>
  );
}
