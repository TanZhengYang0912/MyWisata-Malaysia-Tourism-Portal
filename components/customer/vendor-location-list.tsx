"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperatingHours } from "@/backend/core/types";
import { formatPeriods } from "@/components/customer/operating-hours-summary";
import { Button } from "@/components/ui/button";
import { getMalaysiaTodayKey, getNextOpening, isOperatingHoursOpenNow } from "@/lib/customer/operating-hours";

export type VendorLocationRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  operatingHours: OperatingHours | null;
  href: string;
  directionsHref: string;
};

const FIRST_PAGE = 4;

/** One row per outlet with today's status; four rows, then "Show all". */
export function VendorLocationList({ locations }: { locations: VendorLocationRow[] }) {
  const { t } = useTranslation("customer");
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  // Open/closed depends on the viewer's clock, so it is filled in after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);
  const shown = showAll ? locations : locations.slice(0, FIRST_PAGE);

  function status(location: VendorLocationRow) {
    if (!now) return null;
    if (!location.operatingHours) return <span>{t("ui.operatingHours.unavailable")}</span>;
    if (isOperatingHoursOpenNow(location.operatingHours, now)) {
      const today = getMalaysiaTodayKey(now);
      return <><span className="font-bold text-emerald-700 dark:text-emerald-300">{t("ui.operatingHours.openNow")}</span> · {formatPeriods(location.operatingHours, today, t("ui.operatingHours.closed"), t("ui.operatingHours.unavailable"), t("ui.operatingHours.allDay"))}</>;
    }
    const next = getNextOpening(location.operatingHours, now);
    const day = next && (next.offsetDays === 0 ? t("ui.vendor.today") : next.offsetDays === 1 ? t("ui.vendor.tomorrow") : t(`ui.labels.days.${next.day}`));
    return <><span className="font-bold text-red-600 dark:text-red-300">{t("ui.operatingHours.closedNow")}</span>{next && <> · {t("ui.vendor.opensAt", { day, time: next.time })}</>}</>;
  }

  return (
    <div className="mt-6">
      <ul className="grid gap-2.5">
        {shown.map((location) => {
          const place = [location.city, location.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
          const live = status(location);
          return (
            <li key={location.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card px-3.5 py-3 sm:grid-cols-[44px_minmax(0,1fr)_auto]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><MapPin size={18} aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="break-words text-[13.5px] font-bold text-foreground">{location.name}</p>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{live}{live && " · "}{place}</p>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end">
                <a href={location.directionsHref} target="_blank" rel="noreferrer" aria-label={t("ui.vendor.getDirectionsTo", { outlet: location.name })} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                  <Navigation size={13} aria-hidden="true" /> {t("ui.vendor.directions")}
                </a>
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href={location.href}>{t("ui.vendor.viewOutlet")}</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length < locations.length && (
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowAll(true)}>
            {t("ui.vendor.showAllLocations", { count: locations.length })}
          </Button>
        </div>
      )}
    </div>
  );
}
