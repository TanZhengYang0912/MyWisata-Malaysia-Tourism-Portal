"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { ArrowLeft, CalendarDays, Clock, MapPin, Megaphone, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { LocalizedContent } from "@/components/customer/localized-content";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { PromotionCampaignVendorCard } from "@/components/customer/promotion-campaign-vendor-card";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatEventDateRange, formatEventHours, getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

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

  return (
    <CustomerPageShell wide>
      {campaign && <Breadcrumbs className="mb-4" label={t("ui.place.breadcrumb")} items={[
        { label: t("navigation.home"), href: "/customer" },
        { label: t("navigation.events"), href: "/customer/events" },
        { label: <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} /> },
      ]} />}
      <CustomerPageHeader
        eyebrow={t("ui.promotionCampaigns.eyebrow")}
        title={campaign ? <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} /> : t("ui.promotionCampaigns.detailTitle")}
        description={campaign ? undefined : t("ui.promotionCampaigns.detailDescription")}
        icon={<Megaphone size={15} />}
        className="mb-6"
        actions={<Button asChild variant="outline" className="rounded-full"><BackLink fallbackHref="/customer/events"><ArrowLeft size={15} /> {t("actions.back", { ns: "common" })}</BackLink></Button>}
      />
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p> : error ? (
        <div role="alert" className="rounded-3xl border border-border bg-card p-8 text-center"><CalendarDays size={28} className="mx-auto text-primary" /><h2 className="mt-3 font-bold text-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFound" : "ui.promotionCampaigns.loadError")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFoundDescription" : "ui.promotionCampaigns.tryAgainDescription")}</p><div className="mt-5 flex justify-center gap-2">{error === "load" && <Button variant="outline" className="rounded-full" onClick={() => void refresh()}><RefreshCw size={14} /> {t("ui.actions.retry")}</Button>}<Button asChild className="rounded-full"><Link href="/customer/events">{t("ui.promotionCampaigns.backToEvents")}</Link></Button></div></div>
      ) : campaign && <>
        <section className="mb-5 overflow-hidden rounded-3xl border border-primary/10 bg-card sm:mb-6">
          <div className={campaign.posterUrl ? "grid lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]" : undefined}>
            {campaign.posterUrl && (
              <div className="flex h-56 min-w-0 items-center justify-center bg-background/50 p-4 sm:h-80 lg:h-[26rem]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={campaign.posterUrl} alt={campaign.title} className="h-full w-full object-contain" />
              </div>
            )}
            <div className="min-w-0 p-5 sm:p-7 lg:flex lg:flex-col lg:justify-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${(campaign.operationalStatus ? campaign.operationalStatus === "operating" : campaign.visibility === "live") ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
                  {t(getEventOperationalLabelKey(campaign))}
                </span>
                <CalendarDays size={14} className="ml-1 text-primary" />
                <span className="text-sm text-muted-foreground">
                  {(isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime)(campaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })} – {(isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime)(campaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                </span>
              </div>
              {campaign.locations.length > 0 && (
                <section aria-labelledby="event-locations-heading" className="mt-5">
                  <h2 id="event-locations-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                    {t("ui.promotionCampaigns.locationsSection", { count: campaign.locations.length })}
                  </h2>
                  <ul className="mt-3 grid gap-2.5">
                    {campaign.locations.map((location) => (
                      <li key={location.id} className="rounded-2xl border border-border/80 bg-card/80 p-3.5 sm:p-4">
                        <p className="flex items-start gap-2 font-semibold text-foreground"><MapPin size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />{location.name}</p>
                        <p className="mt-1 break-words pl-6 text-xs leading-5 text-muted-foreground">{location.address ?? t("ui.promotionCampaigns.addressTba")}</p>
                        <p className="mt-2 flex items-center gap-2 pl-6 text-xs text-muted-foreground"><CalendarDays size={13} aria-hidden="true" />{formatEventDateRange(location.startsOn, location.endsOn, locale)}</p>
                        <p className="mt-1 flex items-center gap-2 pl-6 text-xs text-muted-foreground"><Clock size={13} aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {campaign.visibility === "upcoming" && (
                <p className="mt-4 rounded-xl bg-amber-100/70 dark:bg-amber-500/15 px-4 py-3 text-sm font-medium leading-5 text-amber-950 dark:text-amber-200">
                  {t("ui.promotionCampaigns.upcomingNotice")}
                </p>
              )}
            </div>
          </div>
        </section>
        <details className="mb-6 rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5">
          <summary className="cursor-pointer text-sm font-semibold text-primary underline-offset-4 hover:underline">
            {t("ui.promotionCampaigns.campaignDetails")}
          </summary>
          <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
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
            <div className="grid min-w-0 gap-4">
              {visibleVendorCards.map(({ vendor, matchingStallNumbers }) => <PromotionCampaignVendorCard key={vendor.vendorId} vendor={vendor} campaignSlug={campaign.slug} mode="detail" layout="featured" matchingStallNumbers={matchingStallNumbers} />)}
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleVendorCards.map(({ vendor, matchingStallNumbers }) => <PromotionCampaignVendorCard key={vendor.vendorId} vendor={vendor} campaignSlug={campaign.slug} mode="detail" matchingStallNumbers={matchingStallNumbers} />)}
            </div>
          )}

          <DirectoryPagination
            ariaLabel={t("ui.promotionCampaigns.vendorPages")}
            currentPage={safeVendorPage}
            itemLabel={t("ui.promotionCampaigns.vendorsLabel")}
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
