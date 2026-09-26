"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Megaphone, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { PromotionCampaignOfferCard } from "@/components/customer/promotion-campaign-offer-card";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = {
  slug: string;
  initialCampaign: PromotionCampaignPublic | null;
  initialError: "load" | "missing" | null;
};

export function PromotionCampaignDetailClient({ slug, initialCampaign, initialError }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaign, setCampaign] = useState(initialCampaign);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"load" | "missing" | null>(initialError);

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
      <CustomerPageHeader
        eyebrow={t("ui.promotionCampaigns.eyebrow")}
        title={campaign?.title ?? t("ui.promotionCampaigns.detailTitle")}
        description={campaign ? undefined : t("ui.promotionCampaigns.detailDescription")}
        icon={<Megaphone size={15} />}
        actions={<Button asChild variant="outline" className="rounded-full"><Link href="/customer/events"><ArrowLeft size={15} /> {t("ui.promotionCampaigns.backToEvents")}</Link></Button>}
      />
      {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.loading")}</p> : error ? (
        <div role="alert" className="rounded-3xl border border-border bg-card p-8 text-center"><CalendarDays size={28} className="mx-auto text-primary" /><h2 className="mt-3 font-bold text-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFound" : "ui.promotionCampaigns.loadError")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t(error === "missing" ? "ui.promotionCampaigns.notFoundDescription" : "ui.promotionCampaigns.tryAgainDescription")}</p><div className="mt-5 flex justify-center gap-2">{error === "load" && <Button variant="outline" className="rounded-full" onClick={() => void refresh()}><RefreshCw size={14} /> {t("ui.actions.retry")}</Button>}<Button asChild className="rounded-full"><Link href="/customer/events">{t("ui.promotionCampaigns.backToEvents")}</Link></Button></div></div>
      ) : campaign && <>
        <section className="mb-7 rounded-3xl border border-primary/10 bg-gradient-to-r from-primary/[0.07] via-card to-highlight-yellow/10 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${campaign.visibility === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {t(campaign.visibility === "live" ? "ui.promotionCampaigns.live" : "ui.promotionCampaigns.upcoming")}
            </span>
            <CalendarDays size={14} className="ml-1 text-primary" />
            <span className="text-sm text-muted-foreground">
              {formatDateTime(campaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })} – {formatDateTime(campaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
            </span>
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
            {t("ui.promotionCampaigns.offerSection")}
          </h2>
          <details className="mt-3 rounded-2xl border border-primary/10 bg-card/70 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary underline-offset-4 hover:underline">
              {t("ui.promotionCampaigns.campaignDetails")}
            </summary>
            <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
              {campaign.description}
            </p>
          </details>
          {campaign.visibility === "upcoming" && (
            <p className="mt-4 rounded-xl bg-amber-100/70 px-4 py-3 text-sm font-medium text-amber-950">
              {t("ui.promotionCampaigns.upcomingNotice")}
            </p>
          )}
        </section>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{campaign.offers.map((offer) => <PromotionCampaignOfferCard key={offer.id} offer={offer} campaign={campaign} mode="detail" />)}</div>
        {campaign.offers.length === 0 && <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("ui.promotionCampaigns.noOffers")}</p>}
      </>}
    </CustomerPageShell>
  );
}
