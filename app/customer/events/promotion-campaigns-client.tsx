"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Megaphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { PromotionCampaignOfferCard } from "@/components/customer/promotion-campaign-offer-card";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = { initialCampaigns: PromotionCampaignPublic[]; initialError: boolean };

export function PromotionCampaignsClient({ initialCampaigns, initialError }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

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
        description={t("ui.promotionCampaigns.pageDescription")}
        icon={<Megaphone size={15} />}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/customer"><ArrowLeft size={15} /> {t("ui.promotionCampaigns.home")}</Link></Button>}
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
      ) : !error && <div className="space-y-8">{sortedCampaigns.map((campaign) => {
        const isLive = campaign.visibility === "live";
        const previewOffers = campaign.offers.slice(0, 3);
        return (
          <section
            key={campaign.id}
            aria-labelledby={`campaign-${campaign.id}`}
            className="overflow-hidden rounded-3xl border border-border/70 bg-card p-5 sm:p-7"
          >
            <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${isLive ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {t(isLive ? "ui.promotionCampaigns.live" : "ui.promotionCampaigns.upcoming")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(isLive ? "ui.promotionCampaigns.endsAt" : "ui.promotionCampaigns.startsAt", {
                      date: formatDateTime(isLive ? campaign.endsAt : campaign.startsAt, locale, {
                        timeZone: "Asia/Kuala_Lumpur",
                      }),
                    })}
                  </span>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {t("ui.promotionCampaigns.offerCount", { count: campaign.offers.length })}
                  </span>
                </div>
                <h2
                  id={`campaign-${campaign.id}`}
                  className="mt-3 break-words font-[family-name:var(--font-display)] text-2xl font-bold text-foreground"
                >
                  {campaign.title}
                </h2>
                <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-muted-foreground">
                  {campaign.summary}
                </p>
              </div>
              <Button asChild className="min-h-11 w-full shrink-0 rounded-full sm:w-auto">
                <Link href={`/customer/events/${encodeURIComponent(campaign.slug)}`}>
                  {t("ui.promotionCampaigns.viewAllOffers", { count: campaign.offers.length })}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {previewOffers.map((offer) => (
                <PromotionCampaignOfferCard
                  key={offer.id}
                  offer={offer}
                  campaign={campaign}
                  mode="preview"
                />
              ))}
            </div>
            {campaign.offers.length > 3 && (
              <p className="mt-4 text-right text-sm font-medium text-muted-foreground">
                {t("ui.promotionCampaigns.previewOfferCount", {
                  shown: previewOffers.length,
                  total: campaign.offers.length,
                })}
              </p>
            )}
          </section>
        );
      })}</div>}
    </CustomerPageShell>
  );
}
