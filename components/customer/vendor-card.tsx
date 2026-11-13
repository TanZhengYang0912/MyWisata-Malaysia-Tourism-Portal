"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Map as MapIcon } from "lucide-react";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { CardFrame, CardLocationStatus } from "@/components/customer/card-frame";
import { ShareButton } from "@/components/shared/share-button";
import { PhotoRatingBadge } from "@/components/customer/photo-rating-badge";

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
  /** Vendor-scope review rating: null = looked up, no reviews yet; undefined = unknown, badge left out. */
  rating?: { value: number; count: number } | null;
  /** True when any outlet is open now; the status is left out when unknown. */
  openNow?: boolean;
  popularProducts?: Array<{ id: string; name: string; imageUrl: string | null; href: string }>;
};

type VendorCardProps = {
  vendor: CustomerVendorCardVendor;
  categories?: readonly string[];
  destinationHref?: string;
  index?: number;
  /** A static tag on the photo (event partners). */
  badge?: ReactNode;
  /** Replaces the locations + open-state row (event partners show their next event). */
  info?: ReactNode;
};

/** A vendor brand on the shared CardFrame: category, name, number of locations and open now. */
export function VendorCard({ vendor, categories = [], destinationHref, index = 0, badge, info }: VendorCardProps) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
  const vendorHref = destinationHref ?? `/customer/vendors/${vendor.id}`;
  const categoryLabels = categories.length
    ? categories.slice(0, 2).map((category) => {
        const key = getOptionalDiscoveryCategoryLabelKey(category);
        return key ? t(key) : category;
      })
    : [t("ui.search.localPartner")];

  return (
    <CardFrame
      data-vendor-card={vendor.id}
      href={vendorHref}
      imageUrl={visual.coverUrl}
      imageAlt={t("ui.search.businessCover", { vendor: vendor.name })}
      fallback={<div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)]" />}
      topLeft={badge}
      actions={<ShareButton compact shareType="vendor" contentId={vendor.id} title={vendor.name} />}
      rating={vendor.rating !== undefined && <PhotoRatingBadge rating={vendor.rating?.value ?? 0} reviews={vendor.rating?.count ?? 0} compactOnPhone />}
      meta={<>
        {categoryLabels.join(" · ")}
        <span className="sr-only">{t("ui.search.vendorCard", { index: index + 1 })}</span>
      </>}
      title={vendor.name}
      info={info ?? <CardLocationStatus
        location={t("ui.vendor.locationCount", { count: vendor.outlets.length })}
        icon={<MapIcon size={13} aria-hidden="true" />}
        open={vendor.openNow}
        openLabel={t("ui.operatingHours.openNow")}
        closedLabel={t("ui.operatingHours.closedNow")}
      />}
      brandMark={visual.logoUrl
        // eslint-disable-next-line @next/next/no-img-element -- vendor logos come from runtime-configured storage hosts
        ? <img src={visual.logoUrl} alt="" className="h-full w-full bg-card object-cover" />
        : visual.initials}
    />
  );
}
