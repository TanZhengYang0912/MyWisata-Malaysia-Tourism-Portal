"use client";

import Link from "next/link";
import { Building2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { ExpandCard } from "@/components/customer/expand-card";

export type CustomerVendorCardVendor = {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  outlets: ReadonlyArray<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    badgeSlugs?: string[];
  }>;
};

type VendorCardProps = {
  vendor: CustomerVendorCardVendor;
  categories?: readonly string[];
  description?: string | null;
  descriptionFallback?: string;
  destinationHref?: string;
  distanceLabel?: string;
  index?: number;
  isFeatured?: boolean;
};

export function VendorCard({
  vendor,
  categories = [],
  description,
  descriptionFallback,
  destinationHref,
  distanceLabel,
  index = 0,
  isFeatured = false,
}: VendorCardProps) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
  const vendorHref = destinationHref ?? `/customer/vendor/${vendor.id}`;
  const outlet = vendor.outlets[0];
  const location = [outlet?.city, outlet?.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
  const cardDescription = description?.trim() || descriptionFallback || t("ui.search.approvedPartnerDescription");
  const categoryLabel = categories.length
    ? categories.map((category) => {
        const key = getOptionalDiscoveryCategoryLabelKey(category);
        return key ? t(key) : category;
      }).join(" · ")
    : t("ui.search.localPartner");
  const badgeLabel = isFeatured ? t("ui.search.featuredPartner") : t("ui.search.verifiedLocalPartner");

  return (
    <ExpandCard
      media={
        <Link href={vendorHref} className="group/vendor-media absolute inset-0 block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
          {visual.coverUrl ? <>
            {/* Vendor-uploaded media is intentionally rendered as a normal img because storage hosts are runtime-configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.coverUrl} alt={t("ui.search.businessCover", { vendor: vendor.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/vendor-media:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </> : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)] text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/10 dark:bg-card/10 text-2xl font-black tracking-tight shadow-xl backdrop-blur-sm">{visual.initials}</span>
            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{t("ui.search.localPartner")}</span>
          </div>}
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isFeatured ? "bg-[#ffcc00] text-[#010066]" : "bg-card/95 text-foreground"}`}>{isFeatured ? <Sparkles size={12} /> : <ShieldCheck size={12} className="text-primary" />} {badgeLabel}</span>
        </Link>
      }
      title={<>
        <Link href={vendorHref} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"><h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={vendor.name}>{vendor.name}</h3></Link>
        <span className="sr-only">{t("ui.search.vendorCard", { index: index + 1 })}</span>
      </>}
      details={<>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> <span>{location}{distanceLabel && <> · {distanceLabel}</>}</span></p>
        <p className="break-words whitespace-normal text-xs leading-5 text-foreground/80">{cardDescription}</p>
        <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Building2 size={12} aria-hidden="true" /> {t("ui.search.outletCount", { count: vendor.outlets.length })}</span>
          <span className="min-w-0 break-words whitespace-normal text-right">{categoryLabel}</span>
        </div>
      </>}
      detailsId={`vendor-card-details-${vendor.id}`}
      action={{ href: vendorHref, label: t("ui.actions.exploreVendor") }}
    />
  );
}
