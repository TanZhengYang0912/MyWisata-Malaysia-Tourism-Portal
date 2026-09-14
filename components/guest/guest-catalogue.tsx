"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import { guestVendorHref } from "@/lib/auth/guest-mode";
import type { ComputedActivity } from "@/backend/core/types";
import { ReferencePrice } from "@/components/shared/reference-price";

type GuestCatalogueProps = {
  activities: ComputedActivity[];
  error?: string;
};

export function GuestCatalogue({ activities, error }: GuestCatalogueProps) {
  const { t } = useTranslation("customer");
  if (error) {
    return <main className="mx-auto max-w-3xl px-6 py-20 text-center"><h1 className="text-2xl font-bold">{t("ui.guest.unableToLoadListings")}</h1><p className="mt-2 text-muted-foreground">{error}</p><Link href="/guest/explore" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">{t("ui.actions.retry")}</Link></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.guest.discoverMalaysia")}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">{t("ui.guest.browseTitle")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("ui.guest.browseDescription")}</p>

      {activities.length === 0 ? <section className="mt-10 rounded-2xl border border-border bg-card p-10 text-center"><h2 className="text-xl font-bold">{t("ui.guest.noListings")}</h2><p className="mt-2 text-muted-foreground">{t("ui.guest.checkBackLater")}</p></section> : (
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => <article key={activity.id} className="mw-card">
            <div className="mw-card-media">
              {activity.image ? <>
                {/* Guest catalogue supports vendor-uploaded storage URLs, which are not statically enumerable for next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activity.image} alt="" className="h-full w-full object-cover" />
              </> : null}
            </div>
            <div className="mw-card-body space-y-3 p-5">
              <div><p className="text-xs font-semibold text-primary">{activity.category || t("ui.guest.experience")}</p><h2 className="mw-card-title mt-1 text-lg font-bold" title={activity.name}>{activity.name}</h2></div>
              <p className="mw-card-meta flex items-center gap-1 text-sm text-muted-foreground" title={`${activity.outlet.city}, ${activity.outlet.state}`}><MapPin size={14} />{activity.outlet.city}, {activity.outlet.state}</p>
              <div className="mw-card-footer"><ReferencePrice amountMYR={Number(activity.price)} className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary" /><div className="flex flex-wrap justify-end gap-3 text-sm font-semibold"><Link href={`/guest/activity/${activity.id}`} className="text-primary underline underline-offset-4">{t("ui.guest.viewListing")}</Link><Link href={guestVendorHref(activity.outlet.vendorId)} className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4"><Store size={14} />{t("ui.guest.viewVendor")}</Link></div></div>
            </div>
          </article>)}
        </section>
      )}
    </main>
  );
}
