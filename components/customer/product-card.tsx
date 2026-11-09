"use client";

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BedDouble, ImageOff, Store } from "lucide-react";
import { useOptionalWishlist, useWishlist } from "@/components/providers/wishlist";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { ShareButton } from "@/components/shared/share-button";
import { ReferencePrice } from "@/components/shared/reference-price";
import { CardFrame, CardLocation } from "@/components/customer/card-frame";
import type { ComputedActivity, DiscoveryPropertySummary } from "@/backend/core/types";
import { canonicalCategorySlug, getDiscoveryCategoryLabelKey, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { buildActivityPath, buildProductPath } from "@/lib/customer/navigation-context";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { LocalizedContent } from "@/components/customer/localized-content";
import { PhotoRatingBadge } from "@/components/customer/photo-rating-badge";
import { ProductSaveButton } from "@/components/customer/product-save-button";
import { getVendorProductTypeLabel, type VendorProductCardData } from "@/lib/customer/vendor-page";
import { toVendorCatalogueCard, type ProductCatalogueCardData } from "@/lib/customer/product-catalogue";

type ActivityCardItem = ComputedActivity & {
  sponsorship?: { placementId: string; label: "Sponsored" } | null;
  property?: DiscoveryPropertySummary;
};

type DiscoveryCardProps = { activity: ActivityCardItem; returnTo?: string; outletId?: string; source?: string; onSponsoredClick?: () => void };
type VendorListingProps = { vendorListing: VendorProductCardData; returnTo: string; vendorName?: string };
type CatalogueProductCardProps = { listing: ProductCatalogueCardData; returnTo: string; source?: "home" | "vendor"; onSponsoredClick?: () => void };

/** "From" (only when several outlets sell it) and the price; hotels add "/ night". No "/ person". */
function CardPrice({ amount, from, perNight }: { amount: number; from?: boolean; perNight?: boolean }) {
  const { t } = useTranslation("customer");
  return (
    <p className="flex items-baseline gap-1 text-[10px] text-muted-foreground">
      {from && <span>{t("ui.vendor.from")}</span>}
      <ReferencePrice amountMYR={amount} className="font-[family-name:var(--font-mono)] text-[22px] font-extrabold leading-[1.3] tracking-[-1px] text-primary max-sm:text-lg" />
      {perNight && <span>/ {t("ui.activityDetail.priceUnits.perNight")}</span>}
    </p>
  );
}

/** Products (Food, Activity, Retail) and hotels on the shared CardFrame. The whole card opens the detail page. */
export function ProductCard(props: DiscoveryCardProps | VendorListingProps | CatalogueProductCardProps) {
  if ("listing" in props) return <CatalogueProductCard {...props} />;
  if ("vendorListing" in props) return <CatalogueProductCard listing={{ ...toVendorCatalogueCard(props.vendorListing), vendorName: props.vendorName }} returnTo={props.returnTo} source="vendor" />;
  return <DiscoveryActivityCard {...props} />;
}

function CatalogueProductCard({ listing: product, returnTo, source, onSponsoredClick }: CatalogueProductCardProps) {
  const { t } = useTranslation("customer");
  const wishlist = useOptionalWishlist();
  const href = buildProductPath(product.id, returnTo, product.pinnedOutletId ?? product.singleOutlet?.id, source);
  const typeKey = getOptionalDiscoveryCategoryLabelKey(product.productType);
  const typeLabel = typeKey ? t(typeKey) : getVendorProductTypeLabel(product.productType);
  const locationCount = product.openNowSummary?.totalOutletCount ?? product.sales.outletCount;
  const location = product.pinnedOutletName
    ? <CardLocation icon={<Store size={13} aria-hidden="true" />}>{product.pinnedOutletName}</CardLocation>
    : locationCount > 1
      ? <CardLocation>{t("ui.vendor.locationCount", { count: locationCount })}</CardLocation>
      : product.singleOutlet && [product.singleOutlet.city, product.singleOutlet.state].some(Boolean)
        ? <CardLocation>{[product.singleOutlet.city, product.singleOutlet.state].filter(Boolean).join(", ")}</CardLocation>
        : null;

  return (
    <LocalizedContent entityType="product" entityId={product.id} field="name" sourceText={product.name}>
      {({ text, control }) => (
        <CardFrame
          href={href}
          onNavigate={onSponsoredClick}
          imageUrl={product.imageUrl}
          imageAlt={product.name}
          fallback={<div className="flex h-full items-center justify-center bg-secondary text-xs font-semibold text-primary">{t("ui.vendor.photoComingSoon")}</div>}
          actions={<>
            <ProductSaveButton productId={product.id} productName={product.name} compact />
            {wishlist && <ShareButton compact shareType="product" contentId={product.id} title={product.name} />}
          </>}
          rating={product.ratingKnown !== false && <PhotoRatingBadge rating={product.rating} reviews={product.reviews} />}
          meta={[typeLabel, product.vendorName].filter(Boolean).join(" · ")}
          title={text}
          titleControl={control}
          info={location}
          footer={<CardPrice amount={product.sales.fromPrice} from={product.sales.outletCount > 1} />}
        />
      )}
    </LocalizedContent>
  );
}

function DiscoveryActivityCard({ activity, returnTo, outletId, source, onSponsoredClick }: DiscoveryCardProps) {
  const { t } = useTranslation("customer");
  const [saving, setSaving] = useState(false);
  const { savedIds, toggleSaved, savedOutletIds, toggleSavedOutlet } = useWishlist();
  const gate = useCustomerCapabilityGate();
  const isProperty = Boolean(activity.property);
  // A hotel card saves the whole hotel (D10); every other card saves the product.
  const saved = isProperty ? savedOutletIds.has(activity.outlet.id) : savedIds.has(activity.id);
  const cardName = isProperty ? activity.outlet.name : activity.name;
  const imageSrc = isProperty ? activity.outlet.coverUrl || activity.image : activity.image;
  const activityHref = isProperty ? getOutletShopHref(activity.outlet.id) : buildActivityPath(activity.id, returnTo, outletId, source);
  const categorySlug = canonicalCategorySlug(activity.categorySlug) ?? "activity";
  const meta = [t(getDiscoveryCategoryLabelKey(categorySlug)), activity.outlet.vendorName].filter(Boolean).join(" · ");
  const location = [activity.outlet.city, activity.outlet.state].filter(Boolean).join(", ");

  async function handleSave(event: MouseEvent<HTMLButtonElement>) {
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

  const frame = (title: string, titleControl?: ReactNode) => (
    <CardFrame
      href={activityHref}
      onNavigate={handleCardNavigation}
      imageUrl={imageSrc}
      imageAlt={cardName}
      fallback={
        <div role="img" aria-label={t("ui.activity.imageUnavailable", { name: cardName })} className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-amber-50 text-primary dark:from-indigo-500/10 dark:via-muted dark:to-amber-500/10">
          <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
          <span className="mt-2 text-xs font-bold">{activity.category || t("ui.labels.placeBasedExperience")}</span>
        </div>
      }
      actions={<>
        <SaveToggleButton
          appearance="icon"
          onClick={handleSave}
          disabled={saving}
          saved={saved}
          aria-label={saved ? t("ui.activity.removeSaved", { name: cardName }) : t("ui.activity.save", { name: cardName })}
          title={saved ? t("ui.activity.removeSavedShort") : t("ui.activity.saveShort")}
          className="flex h-8 w-8 items-center justify-center disabled:cursor-wait disabled:opacity-70"
        />
        <ShareButton compact shareType={isProperty ? "outlet" : "product"} contentId={isProperty ? activity.outlet.id : activity.id} title={cardName} />
      </>}
      rating={<PhotoRatingBadge rating={activity.rating} reviews={activity.reviews} />}
      meta={meta}
      title={title}
      titleControl={titleControl}
      info={(location || activity.property) && (
        <div className="flex min-w-0 flex-col gap-1">
          {location && <CardLocation>{location}</CardLocation>}
          {activity.property && <CardLocation icon={<BedDouble size={13} aria-hidden="true" />}>{t("ui.property.roomTypes", { count: activity.property.roomTypeCount })}</CardLocation>}
        </div>
      )}
      footer={<CardPrice amount={activity.property?.fromPrice ?? Number(activity.price)} from={Boolean(activity.property) || (activity.salesSummary?.outletCount ?? 1) > 1} perNight={categorySlug === "accommodation"} />}
    />
  );

  return isProperty
    ? frame(cardName)
    : <LocalizedContent entityType="product" entityId={activity.id} field="name" sourceText={activity.name}>{({ text, control }) => frame(text, control)}</LocalizedContent>;
}
