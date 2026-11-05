"use client";

import Link from "next/link";
import { MapPin, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { ExpandCard } from "@/components/customer/expand-card";
import { ShareButton } from "@/components/shared/share-button";

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
  /** Vendor-scope review rating; the line is left out without it. */
  rating?: { value: number; count: number };
  /** True when any outlet is open now; the status is left out when unknown. */
  openNow?: boolean;
  popularProducts?: Array<{ id: string; name: string; imageUrl: string | null; href: string }>;
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
  // Nearby cards carry only the closest outlet, so a location count would always read 1.
  const showLocationCount = distanceLabel === undefined;
  const badgeLabel = isFeatured ? t("ui.search.featuredPartner") : t("ui.search.verifiedLocalPartner");

  return (
    <ExpandCard
      media={<>
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
        <div className="absolute right-3 top-3 z-20"><ShareButton compact shareType="vendor" contentId={vendor.id} title={vendor.name} /></div>
      </>}
      title={<>
        {/* The logo sits in the title slot and is pulled up to overlap the bottom of the cover. */}
        <span className="relative z-10 -mt-[38px] mb-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border-[3px] border-card bg-primary font-[family-name:var(--font-display)] text-sm font-bold text-primary-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {visual.logoUrl ? <img src={visual.logoUrl} alt="" className="h-full w-full bg-card object-cover" /> : visual.initials}
        </span>
        <Link href={vendorHref} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"><h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={vendor.name}>{vendor.name}</h3></Link>
        <span className="sr-only">{t("ui.search.vendorCard", { index: index + 1 })}</span>
        {vendor.rating && <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><Star size={11} aria-hidden="true" fill="var(--highlight-yellow)" stroke="none" /><span className="font-semibold text-foreground">{vendor.rating.value.toFixed(1)}</span><span>({vendor.rating.count})</span><span>· {categoryLabel}</span></p>}
        {(vendor.openNow !== undefined || showLocationCount) && <p className="text-xs text-muted-foreground">
          {vendor.openNow !== undefined && <span className={`font-bold ${vendor.openNow ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{t(vendor.openNow ? "ui.operatingHours.openNow" : "ui.operatingHours.closedNow")}</span>}
          {vendor.openNow !== undefined && showLocationCount && " · "}
          {showLocationCount && t("ui.vendor.locationCount", { count: vendor.outlets.length })}
        </p>}
      </>}
      details={<>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> <span>{location}{distanceLabel && <> · {distanceLabel}</>}</span></p>
        <p className="break-words whitespace-normal text-xs leading-5 text-foreground/80">{cardDescription}</p>
        {vendor.popularProducts && vendor.popularProducts.length > 0 && <div>
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{t("ui.vendor.popular")}</p>
          <div className="mt-1.5 flex gap-1.5">
            {vendor.popularProducts.slice(0, 3).map((product) => (
              <Link key={product.id} href={product.href} title={product.name} aria-label={product.name} className="block h-11 w-11 shrink-0 overflow-hidden rounded-[9px] bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}
              </Link>
            ))}
          </div>
        </div>}
      </>}
      detailsId={`vendor-card-details-${vendor.id}`}
      action={{ href: vendorHref, label: t("ui.actions.exploreVendor") }}
    />
  );
}
