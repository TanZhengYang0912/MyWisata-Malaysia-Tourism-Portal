"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** Every stall joining a campaign, as a sideways-scrolling row under its event pass. */
export function CampaignStallStrip({ campaign }: { campaign: PromotionCampaignPublic }) {
  const { t } = useTranslation("customer");
  if (campaign.vendors.length === 0) return null;
  const slug = encodeURIComponent(campaign.slug);

  return (
    <div data-slot="campaign-stall-strip" className="border-t border-dashed border-border bg-secondary/30">
      <div className="flex items-center justify-between gap-3 px-[18px] pt-3">
        <p className="text-[12.5px] font-bold text-foreground">{t("ui.promotionCampaigns.stallsJoining", { count: campaign.vendors.length })}</p>
        <Link href={`/customer/events/${slug}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          {t("ui.promotionCampaigns.viewAllStalls")} <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-[18px] pt-3">
        {campaign.vendors.map((vendor) => {
          const stall = vendor.stalls[0];
          return (
            <Link
              key={vendor.vendorId}
              href={`/customer/events/${slug}/${encodeURIComponent(vendor.vendorId)}`}
              className="flex shrink-0 grow-0 basis-[210px] snap-start items-center gap-2.5 rounded-[14px] border border-border bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <span className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary text-xs font-bold text-primary">
                {vendor.vendorLogoUrl
                  ? <Image src={vendor.vendorLogoUrl} alt="" fill sizes="38px" unoptimized={vendor.vendorLogoUrl.startsWith("http://") || vendor.vendorLogoUrl.startsWith("https://")} className="object-cover" />
                  : initials(vendor.vendorName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold text-foreground">{vendor.vendorName}</span>
                {stall?.stallNumber && <span className="block text-[11px] text-muted-foreground">{t("ui.promotionCampaigns.stallNumber", { number: stall.stallNumber })}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
