"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, MapPin, Sparkles, Store, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { formatDateTime, formatMYR, formatMYRNumber } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignOffer, PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

type Props = {
  offer: PromotionCampaignOffer;
  campaign: Pick<PromotionCampaignPublic, "slug" | "startsAt" | "endsAt" | "visibility">;
  mode: "preview" | "detail";
};

export function PromotionCampaignOfferCard({ offer, campaign, mode }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const gate = useCustomerCapabilityGate();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    function updateAtBoundary() {
      const now = Date.now();
      setCurrentTime(now);
      const start = Date.parse(campaign.startsAt);
      const end = Date.parse(campaign.endsAt);
      const nextBoundary = now < start ? start : now < end ? end : null;
      if (nextBoundary !== null) timer = window.setTimeout(updateAtBoundary, Math.max(0, nextBoundary - now) + 1);
    }
    updateAtBoundary();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [campaign.endsAt, campaign.startsAt]);
  const liveBySchedule = currentTime >= Date.parse(campaign.startsAt) && currentTime < Date.parse(campaign.endsAt);
  const image = offer.kind === "product" ? offer.product.imageUrl : offer.outlet?.imageUrl ?? offer.vendor.logoUrl;
  const imageName = offer.kind === "product" ? offer.product.name : offer.voucher.name;
  const placeName = offer.kind === "product" ? offer.vendor.name : offer.outlet?.name;
  const placeDetail = offer.kind === "product"
    ? ""
    : offer.outlet
      ? [offer.outlet.city, offer.outlet.state].filter(Boolean).join(", ")
      : t("ui.promotionCampaigns.vendorWide");
  const claimHref = "/customer/vouchers?tab=mine";
  const productHref = offer.kind === "product"
    ? `/customer/activity/${encodeURIComponent(offer.product.id)}?outletId=${encodeURIComponent(offer.outlet.id)}`
    : "";

  async function claimVoucher() {
    if (offer.kind !== "voucher" || claiming) return;
    const clickTime = Date.now();
    if (clickTime < Date.parse(campaign.startsAt) || clickTime >= Date.parse(campaign.endsAt)) {
      setCurrentTime(clickTime);
      return;
    }
    if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
    setClaiming(true);
    setMessage(null);
    try {
      const response = await fetch("/api/customer/vouchers/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId: offer.voucher.id }),
      });
      const handledByGate = await gate.handleResponse(response, claimHref);
      if (handledByGate) return;
      if (response.ok) {
        setClaimed(true);
        return;
      }
      const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      if (payload?.error?.code === "ALREADY_CLAIMED") setClaimed(true);
      else if (payload?.error?.code === "VOUCHER_LIMIT_REACHED") setMessage(t("ui.promotionCampaigns.claimErrors.limit"));
      else if (payload?.error?.code === "VOUCHER_CLAIM_NOT_STARTED") setMessage(t("ui.promotionCampaigns.claimErrors.notStarted"));
      else if (payload?.error?.code === "VOUCHER_CLAIM_CLOSED" || payload?.error?.code === "VOUCHER_EXPIRED") setMessage(t("ui.promotionCampaigns.claimErrors.closed"));
      else setMessage(t("ui.promotionCampaigns.claimErrors.generic"));
    } catch {
      setMessage(t("ui.promotionCampaigns.claimErrors.generic"));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[16/8] overflow-hidden bg-gradient-to-br from-primary/10 via-secondary to-highlight-yellow/20">
        {image ? <Image src={image} alt={imageName} fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized={image.startsWith("http://") || image.startsWith("https://")} className="object-cover" /> : <div className="flex h-full items-center justify-center text-primary"><Sparkles size={28} aria-hidden="true" /></div>}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-bold text-primary shadow-sm"><Ticket size={13} aria-hidden="true" /> {offer.kind === "voucher" ? t("ui.promotionCampaigns.voucher") : t("ui.promotionCampaigns.product")}</span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="break-words font-bold text-foreground">{offer.kind === "voucher" ? offer.voucher.name : offer.product.name}</h3><p className="mt-1 break-words text-sm font-semibold text-primary">{offer.kind === "voucher"
            ? offer.voucher.voucherType === "percent"
              ? t("ui.promotionCampaigns.percentOff", { value: offer.voucher.discountValue })
              : offer.voucher.voucherType === "fixed"
                ? t("ui.promotionCampaigns.fixedOff", { value: formatMYRNumber(offer.voucher.discountValue, locale) })
                : t("ui.promotionCampaigns.buyOneGetOne")
            : formatMYR(offer.product.price, locale)}</p></div>
          {offer.kind === "voucher" && offer.voucher.maxUses !== null && <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">{t("ui.promotionCampaigns.remaining", { count: Math.max(0, offer.voucher.maxUses - offer.voucher.usesCount) })}</span>}
        </div>
        {mode === "detail" && <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-muted-foreground">{offer.kind === "voucher" ? t("ui.promotionCampaigns.voucherFrom", { vendor: offer.vendor.name }) : offer.product.description || t("ui.promotionCampaigns.productFrom", { vendor: offer.vendor.name })}</p>}
        <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex min-w-0 items-start gap-2"><Store size={14} className="mt-0.5 shrink-0 text-primary" /><span className="break-words">{placeName ? <>{placeName}{placeDetail ? ` · ${placeDetail}` : ""}</> : t("ui.promotionCampaigns.vendorOutlets", { vendor: offer.vendor.name })}</span></p>
          {offer.kind === "voucher" && offer.eligibleOutlets.length > 1 && <p className="break-words pl-6"><span>{t("ui.promotionCampaigns.eligibleOutlets", { count: offer.eligibleOutlets.length })}</span><span aria-hidden="true">: </span><span>{offer.eligibleOutlets.map((outlet) => outlet.name).join(", ")}</span></p>}
          {offer.kind === "voucher" && offer.voucher.minSpend > 0 && <p className="pl-6">{t("ui.promotionCampaigns.minimumSpend", { amount: formatMYR(offer.voucher.minSpend, locale) })}</p>}
          {offer.kind === "voucher" && offer.voucher.validUntil && <p className="flex items-start gap-2"><CalendarDays size={14} className="mt-0.5 shrink-0" />{t("ui.promotionCampaigns.offerValidUntil", { date: formatDateTime(offer.voucher.validUntil, locale, { timeZone: "Asia/Kuala_Lumpur" }) })}</p>}
          {offer.kind === "voucher" && offer.eligibleProducts.length > 0 && <p className="break-words pl-6"><span>{t("ui.promotionCampaigns.eligibleProducts")}</span><span aria-hidden="true">: </span><span>{offer.eligibleProducts.slice(0, 4).map((product) => product.name).join(", ")}</span></p>}
          {offer.kind === "product" && <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" /><span className="break-words">{offer.outlet.name}{[offer.outlet.city, offer.outlet.state].filter(Boolean).length > 0 ? ` · ${[offer.outlet.city, offer.outlet.state].filter(Boolean).join(", ")}` : ""}</span></p>}
        </div>
        {mode === "detail" && <div className="mt-auto pt-4">
          {offer.kind === "product" ? (
            liveBySchedule ? <Button asChild className="w-full rounded-full"><Link href={productHref}>{t("ui.promotionCampaigns.viewProduct")} <ArrowUpRight size={15} /></Link></Button>
              : <Button type="button" disabled className="w-full rounded-full">{t("ui.promotionCampaigns.availableAtStart")}</Button>
          ) : claimed ? <div className="space-y-2"><p role="status" className="text-center text-sm font-semibold text-emerald-700">{t("ui.promotionCampaigns.claimed")}</p><Button asChild variant="outline" className="w-full rounded-full"><Link href={claimHref}>{t("ui.promotionCampaigns.viewMyVouchers")} <ArrowUpRight size={15} /></Link></Button></div>
            : <Button type="button" onClick={() => void claimVoucher()} disabled={!liveBySchedule || claiming} className="w-full rounded-full">{claiming ? t("ui.promotionCampaigns.claiming") : liveBySchedule ? t("ui.promotionCampaigns.claimVoucher") : t("ui.promotionCampaigns.availableAtStart")}</Button>}
          {message && <p role="alert" className="mt-2 text-center text-xs text-destructive">{message}</p>}
        </div>}
      </div>
    </article>
  );
}
