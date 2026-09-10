"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Accessibility, CheckCircle, Clock, ImageOff, MapPin, Star, Store } from "lucide-react";
import { useWishlist } from "@/components/providers/wishlist";
import { CategoryIcon } from "@/components/customer/category-icon";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { AiTag } from "./ai-tag";
import { ShareButton } from "@/components/shared/share-button";
import type { ComputedActivity } from "@/backend/core/types";
import { canonicalCategorySlug, getDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { DISTANCE_UNIT_KM, TRENDING_SYMBOL } from "@/lib/i18n/invariant-tokens";
import { formatMYR } from "@/lib/i18n/format";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

type ActivityCardItem = ComputedActivity & {
  sponsorship?: { placementId: string; label: "Sponsored" } | null;
};

export function ActivityCard({ activity, recommendationReason, returnTo, onSponsoredClick }: { activity: ActivityCardItem; recommendationReason?: string; returnTo?: string; onSponsoredClick?: () => void }) {
  const { t } = useTranslation("customer");
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { savedIds, toggleSaved } = useWishlist();
  const gate = useCustomerCapabilityGate();
  const saved = savedIds.has(activity.id);
  const imageSrc = activity.image?.trim();
  const activityHref = buildActivityPath(activity.id, returnTo);
  const categorySlug = canonicalCategorySlug(activity.categorySlug) ?? "activity";
  const categoryLabel = t(getDiscoveryCategoryLabelKey(categorySlug));

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
    await toggleSaved(activity.id);
    setSaving(false);
  }

  return (
    <article
      className="mw-card group transition-all duration-200 hover:-translate-y-1"
    >
      <div className="mw-card-media">
        <Link href={activityHref} onClick={onSponsoredClick} className="block h-full" aria-label={t("ui.activity.view", { name: activity.name })}>
          {!imageSrc || imageFailed ? (
            <div
              role="img"
              aria-label={t("ui.activity.imageUnavailable", { name: activity.name })}
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-amber-50 text-primary"
            >
              <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
              <span className="mt-2 text-xs font-bold">{activity.category || t("ui.labels.placeBasedExperience")}</span>
              <span className="mt-0.5 text-[10px] text-slate-500">{t("ui.labels.imageUnavailable")}</span>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageSrc}
              alt={activity.name}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ backgroundColor: "#EEF2FF" }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-0.5 text-[10px] font-bold text-primary"><CategoryIcon category={categorySlug} size={11} /> {categoryLabel}</span>
            {activity.isHiddenGem && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-900"><CategoryIcon category="hidden_gem" size={11} /> {t("categories.hiddenGem")}</span>}
            {activity.sponsorship && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{t("ui.labels.sponsored")}</span>}
            {activity.hot && <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">{TRENDING_SYMBOL} {t("ui.labels.trending")}</span>}
          </div>
          {activity.outlet.verified && <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white"><CheckCircle size={9} aria-hidden="true" /> {t("ui.labels.verified")}</div>}
          {activity.outlet.wheelchairAccessible === true && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white" title={t("ui.labels.wheelchairAccessible")}><Accessibility size={9} aria-hidden="true" /> {t("ui.labels.accessible")}</div>}
          {!activity.outlet.open && <div className="absolute bottom-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: "rgba(36,49,58,0.8)" }}>{t("ui.labels.closed")}</div>}
        </Link>
        <SaveToggleButton
          onClick={handleSave}
          disabled={saving}
          saved={saved}
          aria-label={saved ? t("ui.activity.removeSaved", { name: activity.name }) : t("ui.activity.save", { name: activity.name })}
          title={saved ? t("ui.activity.removeSavedShort") : t("ui.activity.saveShort")}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition ${saved ? "bg-amber-100 text-primary" : "bg-white/90 text-slate-700"} disabled:cursor-wait disabled:opacity-70`}
        />
        <div className="absolute right-3 top-12">
          <ShareButton compact shareType="product" contentId={activity.id} title={activity.name} />
        </div>
      </div>
      <div className="mw-card-body space-y-2 p-4">
        <Link href={activityHref} onClick={onSponsoredClick} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
          <h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={activity.name}>{activity.name}</h3>
          <div className="mw-card-meta mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={11} aria-hidden="true" /> {activity.outlet.city}, {activity.outlet.state}</div>
        </Link>
        <Link href={getOutletShopHref(activity.outlet.id)} className="mw-card-meta flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-primary" title={t("ui.activity.visitShop", { vendor: activity.outlet.vendorName ?? t("ui.labels.localVendor") })}>
          <Store size={11} aria-hidden="true" /> <span className="truncate">{t("ui.activity.visitShop", { vendor: activity.outlet.vendorName ?? t("ui.labels.localVendor") })}</span>
        </Link>
        <div className="flex min-h-5 items-center gap-3">
          <div className="flex items-center gap-1 text-xs"><Star size={11} aria-hidden="true" fill="var(--highlight-yellow)" stroke="none" /><span className="font-semibold text-foreground">{activity.rating}</span><span className="text-muted-foreground">({activity.reviews})</span></div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={10} aria-hidden="true" /> {activity.duration}</div>
          {activity.distanceKm !== undefined && <div className="text-xs text-muted-foreground">{activity.distanceKm} {DISTANCE_UNIT_KM}</div>}
        </div>
        {(activity.aiTag || recommendationReason) && <AiTag text={recommendationReason ?? activity.aiTag ?? ""} />}
        <div className="mw-card-footer pt-1">
          <div>
            <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">{formatMYR(Number(activity.price))}</span>
            {(activity.categorySlug === "activity" || activity.requiresBooking) && (
              <span className="ml-1 text-xs text-muted-foreground">/ {t("ui.labels.person")}</span>
            )}
          </div>
          <Link href={activityHref} onClick={onSponsoredClick} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">{activity.requiresBooking ? t("ui.actions.bookNow") : t("ui.actions.buyNow")}</Link>
        </div>
      </div>
    </article>
  );
}
