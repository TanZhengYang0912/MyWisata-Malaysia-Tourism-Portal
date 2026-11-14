"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";
import styles from "./promotion-campaign-vendor-card.module.css";

type Props = {
  vendor: PromotionCampaignPublicVendor;
  campaignSlug: string;
  layout?: "grid" | "featured";
  matchingStallNumbers?: string[];
};

/** A participating vendor's stall within an event — replaces the retired offer-card (see 20260928180000). */
export function PromotionCampaignVendorCard({ vendor, campaignSlug, layout = "grid", matchingStallNumbers = [] }: Props) {
  const { t } = useTranslation("customer");
  const firstStall = vendor.stalls[0];
  const image = firstStall?.stallPosterUrl || vendor.vendorLogoUrl;
  const productCount = vendor.stalls.reduce((count, stall) => count + stall.products.length, 0);
  const isFeatured = layout === "featured";

  return (
    <article className={`${styles.vendorCard} flex min-w-0 flex-col${isFeatured ? " sm:grid sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : ""}`}>
      <div className={`${styles.photoFrame} relative aspect-[16/9] overflow-hidden bg-muted${isFeatured ? " sm:aspect-auto sm:min-h-60" : ""}`}>
        {image ? (
          <Image src={image} alt={vendor.vendorName} fill sizes="(max-width: 768px) 100vw, 50vw" unoptimized={image.startsWith("http://") || image.startsWith("https://")} className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><Store size={26} aria-hidden="true" /></div>
        )}
        <span className={`${styles.stallBadge} absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm`}>
          {vendor.stalls.length === 1
            ? <><Store size={13} aria-hidden="true" className="text-highlight-yellow" /> {t("ui.promotionCampaigns.stallNumber", { number: firstStall.stallNumber })}</>
            : <><MapPin size={13} aria-hidden="true" className="text-highlight-yellow" /> {t("ui.promotionCampaigns.locationCount", { count: vendor.stalls.length })}</>}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className={`${styles.vendorTitle} break-words font-[family-name:var(--font-display)] text-lg font-bold text-foreground`}>{vendor.vendorName}</h3>
        {vendor.vendorKind === "event" && (
          <span className="mt-1 inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{t("ui.eventPartners.badge")}</span>
        )}
        {!isFeatured && productCount > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("ui.promotionCampaigns.productCount", { count: productCount })}</p>}
        {matchingStallNumbers.length > 0 && (
          <div className="mt-3" role="group" aria-label={t("ui.promotionCampaigns.matchingStalls")}>
            <p className="text-xs font-semibold text-primary">{t("ui.promotionCampaigns.matchingStalls")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {matchingStallNumbers.map((stallNumber) => (
                <span key={stallNumber} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {stallNumber}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-auto pt-4">
          <Button asChild variant="outline" className={`${styles.viewButton} h-11 w-full justify-between rounded-lg px-4`}>
            <Link href={`/customer/events/${encodeURIComponent(campaignSlug)}/${encodeURIComponent(vendor.vendorId)}`}>
              {t("ui.promotionCampaigns.viewStall")} <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
