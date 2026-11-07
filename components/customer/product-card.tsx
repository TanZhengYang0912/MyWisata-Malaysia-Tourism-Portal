"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Accessibility, BedDouble, CheckCircle, Clock, ImageOff, MapPin, MapPinned, Store } from "lucide-react";
import { useOptionalWishlist, useWishlist } from "@/components/providers/wishlist";
import { CategoryIcon } from "@/components/customer/category-icon";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { AiTag } from "./ai-tag";
import { ShareButton } from "@/components/shared/share-button";
import { ReferencePrice } from "@/components/shared/reference-price";
import { ExpandCard } from "@/components/customer/expand-card";
import type { ComputedActivity, DiscoveryPropertySummary } from "@/backend/core/types";
import { canonicalCategorySlug, getDiscoveryCategoryLabelKey, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { buildActivityPath, buildProductPath } from "@/lib/customer/navigation-context";
import { DISTANCE_UNIT_KM, TRENDING_SYMBOL } from "@/lib/i18n/invariant-tokens";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { OperatingHoursSummary } from "@/components/customer/operating-hours-summary";
import { LocalizedContent } from "@/components/customer/localized-content";
import { PhotoCardLabels, PhotoRatingBadge } from "@/components/customer/photo-rating-badge";
import { ProductSaveButton } from "@/components/customer/product-save-button";
import { getVendorProductTypeLabel, type VendorProductCardData } from "@/lib/customer/vendor-page";
import { toVendorCatalogueCard, type ProductCatalogueCardData } from "@/lib/customer/product-catalogue";

type ActivityCardItem = ComputedActivity & {
  sponsorship?: { placementId: string; label: "Sponsored" } | null;
  property?: DiscoveryPropertySummary;
};

type DiscoveryCardProps = { activity: ActivityCardItem; recommendationReason?: string; returnTo?: string; outletId?: string; source?: string; onSponsoredClick?: () => void; hideDiscoveryBadges?: boolean };
type VendorListingProps = { vendorListing: VendorProductCardData; returnTo: string };
type CatalogueProductCardProps = { listing: ProductCatalogueCardData; returnTo: string; source?: "home" | "vendor"; onSponsoredClick?: () => void; recommendationReason?: string };

export const badgeClass = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]";

// The badge row sits right under the name: at most three pills on one line, in priority order.
export function CardBadges({ badges }: { badges: ReactNode[] }) {
  const shown = badges.filter(Boolean).slice(0, 3);
  return shown.length > 0 ? <div className="flex max-h-5 flex-wrap gap-1.5 overflow-hidden">{shown}</div> : null;
}

export function ProductCard(props: DiscoveryCardProps | VendorListingProps | CatalogueProductCardProps) {
  if ("listing" in props) return <VendorListingCard {...props} />;
  if ("vendorListing" in props) return <VendorListingCard listing={toVendorCatalogueCard(props.vendorListing)} returnTo={props.returnTo} source="vendor" />;
  return <DiscoveryActivityCard {...props} />;
}

function VendorListingCard({ listing: product, returnTo, source, onSponsoredClick, recommendationReason }: CatalogueProductCardProps) {
  const { t } = useTranslation("customer");
  const wishlist = useOptionalWishlist();
  const href = buildProductPath(product.id, returnTo, product.pinnedOutletId ?? product.singleOutlet?.id, source);
  const typeKey = getOptionalDiscoveryCategoryLabelKey(product.productType);
  const badges = [
    <span key="type" className={`${badgeClass} bg-secondary font-bold text-primary`}>{typeKey ? t(typeKey) : getVendorProductTypeLabel(product.productType)}</span>,
  ];
  return <ExpandCard
    media={<>
      <Link href={href} onClick={onSponsoredClick} aria-label={t("ui.vendor.viewProductDetails")} className="block h-full">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : <div className="flex h-full items-center justify-center bg-secondary text-xs font-semibold text-primary">{t("ui.vendor.photoComingSoon")}</div>}
      </Link>
      <PhotoCardLabels sponsored={product.sponsored} featured={product.featured} />
      <ProductSaveButton productId={product.id} productName={product.name} compact className="absolute right-3 top-3 z-20" />
      {wishlist && <div className="absolute right-3 top-12 z-20"><ShareButton compact shareType="product" contentId={product.id} title={product.name} /></div>}
      <PhotoRatingBadge rating={product.rating} reviews={product.reviews} className="absolute bottom-3 right-3 z-10" />
    </>}
    title={<LocalizedContent entityType="product" entityId={product.id} field="name" sourceText={product.name}>
      {({ text, control }) => <><Link href={href} onClick={onSponsoredClick}><h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={text}>{text}</h3></Link>{control}<CardBadges badges={badges} /></>}
    </LocalizedContent>}
    price={<>{product.sales.outletCount > 1 && <span className="mr-1 text-xs text-muted-foreground">{t("ui.vendor.from")}</span>}<ReferencePrice amountMYR={product.sales.fromPrice} className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary" /></>}
    details={<>
      {product.pinnedOutletName ? <p className="flex items-center gap-x-1 text-xs text-muted-foreground">
        <Store size={12} className="shrink-0" aria-hidden="true" />
        {product.pinnedOutletName}
      </p> : <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        <MapPinned size={12} aria-hidden="true" />
        {t("ui.vendor.locationCount", { count: product.openNowSummary?.totalOutletCount ?? product.sales.outletCount })}
        {product.openNowSummary && <> · <span className="font-semibold text-emerald-700 dark:text-emerald-300">{t("ui.vendor.openNowCount", { count: product.openNowSummary.openOutletCount })}</span></>}
      </p>}
      {product.description && <p className="break-words text-xs text-muted-foreground"><LocalizedContent entityType="product" entityId={product.id} field="description" sourceText={product.description} /></p>}
      {recommendationReason && <AiTag text={recommendationReason} />}
    </>}
    detailsId={`vendor-product-details-${product.id}`}
    action={{ href, label: product.requiresBooking ? t("ui.actions.bookNow") : t("ui.actions.buyNow"), onClick: onSponsoredClick }}
  />;
}

function DiscoveryActivityCard({ activity, recommendationReason, returnTo, outletId, source, onSponsoredClick, hideDiscoveryBadges = false }: DiscoveryCardProps) {
  const { t } = useTranslation("customer");
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { savedIds, toggleSaved, savedOutletIds, toggleSavedOutlet } = useWishlist();
  const gate = useCustomerCapabilityGate();
  const isProperty = Boolean(activity.property);
  // A hotel card saves the whole hotel (D10); every other card saves the product.
  const saved = isProperty ? savedOutletIds.has(activity.outlet.id) : savedIds.has(activity.id);
  const cardName = isProperty ? activity.outlet.name : activity.name;
  const imageSrc = (isProperty ? activity.outlet.coverUrl || activity.image : activity.image)?.trim();
  const activityHref = isProperty ? getOutletShopHref(activity.outlet.id) : buildActivityPath(activity.id, returnTo, outletId, source);
  const categorySlug = canonicalCategorySlug(activity.categorySlug) ?? "activity";
  const isStayCard = categorySlug === "accommodation";
  const categoryLabel = t(getDiscoveryCategoryLabelKey(categorySlug));
  const detailsId = `activity-card-details-${activity.id}`;
  // Details stay hidden until hover, keyboard focus or a first tap on a touch screen opens the drawer.
  const badges = [
    !isStayCard && !(activity.outlet.currentlyOpen ?? activity.outlet.open) && <span key="closed" className={`${badgeClass} bg-slate-800 font-semibold text-white`}>{t("ui.labels.closed")}</span>,
    !hideDiscoveryBadges && <span key="category" className={`${badgeClass} bg-secondary font-bold text-primary`}><CategoryIcon category={categorySlug} size={11} /> {categoryLabel}</span>,
    activity.outlet.verified && <span key="verified" className={`${badgeClass} bg-primary font-semibold text-white`}><CheckCircle size={9} aria-hidden="true" /> {t("ui.labels.verified")}</span>,
    !hideDiscoveryBadges && activity.hot && <span key="trending" className={`${badgeClass} bg-destructive font-bold text-white`}>{TRENDING_SYMBOL} {t("ui.labels.trending")}</span>,
    activity.outlet.wheelchairAccessible === true && <span key="accessible" className={`${badgeClass} bg-emerald-600 font-semibold text-white`} title={t("ui.labels.wheelchairAccessible")}><Accessibility size={9} aria-hidden="true" /> {t("ui.labels.accessible")}</span>,
  ];
  const detailContent = (
    <>
      <Link href={activityHref} onClick={onSponsoredClick} className="flex items-start gap-1.5 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {activity.outlet.city}, {activity.outlet.state}</Link>
      <Link href={getOutletShopHref(activity.outlet.id)} className="flex items-start gap-1.5 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><Store size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {t("ui.activity.visitShop", { vendor: activity.outlet.vendorName ?? t("ui.labels.localVendor") })}</Link>
      {isStayCard ? null : activity.outlet.operatingHours ? <OperatingHoursSummary hours={activity.outlet.operatingHours} currentlyOpen={activity.outlet.currentlyOpen ?? activity.outlet.open} compact /> : activity.outlet.hours && <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t("ui.labels.operatingHours")}:</span> {activity.outlet.hours}</p>}
      {(activity.property || activity.duration || activity.distanceKm !== undefined) && <div className="flex min-h-5 flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {activity.property && <div className="flex items-center gap-1"><BedDouble size={11} aria-hidden="true" />{t("ui.property.roomTypes", { count: activity.property.roomTypeCount })}</div>}
        {activity.duration && <div className="flex items-center gap-1"><Clock size={10} aria-hidden="true" /> {activity.duration}</div>}
        {activity.distanceKm !== undefined && <div>{activity.distanceKm} {DISTANCE_UNIT_KM}</div>}
      </div>}
      {(activity.aiTag || recommendationReason) && <AiTag text={recommendationReason ?? activity.aiTag ?? ""} />}
    </>
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageFailed(false);
  }, [imageSrc]);

  async function handleSave(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
    setSaving(true);
    await (isProperty ? toggleSavedOutlet(activity.outlet.id) : toggleSaved(activity.id));
    setSaving(false);
  }

  function handleCardNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.defaultPrevented) onSponsoredClick?.();
  }

  return (
    <ExpandCard
      media={<>
        <Link href={activityHref} onClick={handleCardNavigation} className="group/activity-media block h-full" aria-label={t("ui.activity.view", { name: cardName })}>
          {!imageSrc || imageFailed ? (
            <div
              role="img"
              aria-label={t("ui.activity.imageUnavailable", { name: cardName })}
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 dark:from-indigo-500/10 via-slate-50 dark:via-muted to-amber-50 dark:to-amber-500/10 text-primary"
            >
              <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
              <span className="mt-2 text-xs font-bold">{activity.category || t("ui.labels.placeBasedExperience")}</span>
              <span className="mt-0.5 text-[10px] text-slate-500 dark:text-muted-foreground">{t("ui.labels.imageUnavailable")}</span>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageSrc}
              alt={cardName}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover/activity-media:scale-105"
              style={{ backgroundColor: "#EEF2FF" }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
        </Link>
        <PhotoCardLabels sponsored={Boolean(activity.sponsorship)} />
        <SaveToggleButton
          appearance="icon"
          onClick={handleSave}
          disabled={saving}
          saved={saved}
          aria-label={saved ? t("ui.activity.removeSaved", { name: cardName }) : t("ui.activity.save", { name: cardName })}
          title={saved ? t("ui.activity.removeSavedShort") : t("ui.activity.saveShort")}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center disabled:cursor-wait disabled:opacity-70"
        />
        <div className="absolute right-3 top-12 z-20">
          <ShareButton compact shareType={isProperty ? "outlet" : "product"} contentId={isProperty ? activity.outlet.id : activity.id} title={cardName} />
        </div>
        <PhotoRatingBadge rating={activity.rating} reviews={activity.reviews} className="absolute bottom-3 right-3 z-10" />
      </>}
      title={isProperty ? (<>
          <Link href={activityHref} onClick={handleCardNavigation} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
            <h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={cardName}>{cardName}</h3>
          </Link>
          <CardBadges badges={badges} />
        </>) : (
          <LocalizedContent entityType="product" entityId={activity.id} field="name" sourceText={activity.name}>
            {({ text, control }) => <>
              <Link href={activityHref} onClick={handleCardNavigation} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
                <h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={text}>{text}</h3>
              </Link>
              {control}
              <CardBadges badges={badges} />
            </>}
          </LocalizedContent>
        )}
      price={<>
        <ReferencePrice amountMYR={activity.property?.fromPrice ?? Number(activity.price)} className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary" />
        {categorySlug === "accommodation" ? (
          <span className="ml-1 text-xs text-muted-foreground">/ {t("ui.activityDetail.priceUnits.perNight")}</span>
        ) : (activity.categorySlug === "activity" || activity.requiresBooking) && (
          <span className="ml-1 text-xs text-muted-foreground">/ {t("ui.labels.person")}</span>
        )}
      </>}
      details={detailContent}
      detailsId={detailsId}
      action={{ href: activityHref, label: isProperty ? t("ui.property.seeRooms") : activity.requiresBooking ? t("ui.actions.bookNow") : t("ui.actions.buyNow"), onClick: onSponsoredClick }}
    />
  );
}
