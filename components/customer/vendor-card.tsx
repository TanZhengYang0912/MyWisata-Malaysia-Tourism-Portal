"use client";

import Link from "next/link";
import { ArrowRight, Building2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getVendorVisual } from "@/lib/customer/vendor-visual";

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
  }>;
};

type VendorCardProps = {
  vendor: CustomerVendorCardVendor;
  categories?: readonly string[];
  description?: string | null;
  descriptionFallback?: string;
  index?: number;
  isFeatured?: boolean;
  showExploreAction?: boolean;
};

export function VendorCard({
  vendor,
  categories = [],
  description,
  descriptionFallback,
  index = 0,
  isFeatured = false,
  showExploreAction = true,
}: VendorCardProps) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
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
    <article className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <Link href={`/customer/vendor/${vendor.id}`} className="block shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.45] overflow-hidden bg-[#eef2ff]">
          {visual.coverUrl ? <>
            {/* Vendor-uploaded media is intentionally rendered as a normal img because storage hosts are runtime-configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.coverUrl} alt={t("ui.search.businessCover", { vendor: vendor.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </> : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)] text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/10 text-2xl font-black tracking-tight shadow-xl backdrop-blur-sm">{visual.initials}</span>
            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{t("ui.search.localPartner")}</span>
          </div>}
          <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${isFeatured ? "bg-[#ffcc00] text-[#010066]" : "bg-card/95 text-foreground"}`}>{isFeatured ? <Sparkles size={12} /> : <ShieldCheck size={12} className="text-primary" />} {badgeLabel}</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="flex min-h-[220px] flex-1 flex-col space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customer/vendor/${vendor.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><h2 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-foreground">{vendor.name}</h2></Link>
            <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{cardDescription}</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef2ff] text-xs font-bold text-[#010066]">
            {visual.logoUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={visual.logoUrl} alt="" className="h-full w-full object-cover" />
            </> : visual.initials}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Building2 size={13} /> {t("ui.search.outletCount", { count: vendor.outlets.length })}</span><span className="truncate">{categoryLabel}</span></div>
        {showExploreAction && <Link href={`/customer/vendor/${vendor.id}`} className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-foreground transition hover:text-primary">{t("ui.actions.exploreVendor")} <ArrowRight size={13} /></Link>}
      </div>
      <span className="sr-only">{t("ui.search.vendorCard", { index: index + 1 })}</span>
    </article>
  );
}
