"use client";

import { Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardFrame, CardLocationStatus } from "@/components/customer/card-frame";
import { ShareButton } from "@/components/shared/share-button";
import { PhotoRatingBadge } from "@/components/customer/photo-rating-badge";

export type OutletCardOutlet = {
  id: string;
  name: string;
  vendorName?: string | null;
  city?: string | null;
  state?: string | null;
  imageUrl?: string | null;
  /** Left out when unknown. */
  rating?: { value: number; count: number } | null;
  /** Left out when unknown. */
  openNow?: boolean;
};

/** One specific outlet on the shared CardFrame (same layout as VendorCard): vendor, outlet name, location and open now. */
export function OutletCard({ outlet, href }: { outlet: OutletCardOutlet; href: string }) {
  const { t } = useTranslation("customer");
  const location = [outlet.city, outlet.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
  return (
    <CardFrame
      data-outlet-card={outlet.id}
      href={href}
      imageUrl={outlet.imageUrl}
      imageAlt={outlet.name}
      fallback={<div className="flex h-full w-full items-center justify-center bg-secondary text-primary"><Store size={28} strokeWidth={1.5} aria-hidden="true" /></div>}
      actions={<ShareButton compact shareType="outlet" contentId={outlet.id} title={outlet.name} />}
      rating={outlet.rating !== undefined && <PhotoRatingBadge rating={outlet.rating?.value ?? 0} reviews={outlet.rating?.count ?? 0} compactOnPhone />}
      meta={outlet.vendorName ?? undefined}
      title={outlet.name}
      info={<CardLocationStatus location={location} open={outlet.openNow} openLabel={t("ui.operatingHours.openNow")} closedLabel={t("ui.operatingHours.closedNow")} />}
    />
  );
}
