"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { OperatingHours } from "@/backend/core/types";
import { formatPeriods } from "@/components/customer/operating-hours-summary";
import { Button } from "@/components/ui/button";
import { getMalaysiaTodayKey, getNextOpening, isOperatingHoursOpenNow } from "@/lib/customer/operating-hours";
import { OutletCard } from "@/components/customer/outlet-card";

export type VendorLocationRow = {
  id: string;
  name: string;
  vendorName: string;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  /** null = looked up, no reviews; undefined = lookup failed. Both leave the badge out. */
  rating?: { value: number; count: number } | null;
  /** null = no hours on file; the open state is then left out. */
  operatingHours: OperatingHours | null;
  href: string;
};

const FIRST_PAGE = 4;

/** City-choice details reuse this status formatter; the location list stays compact. */
export function useOutletOpenStatus() {
  const { t } = useTranslation("customer");
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  return function status(operatingHours: OperatingHours | null | undefined): ReactNode {
    if (!now) return null;
    if (!operatingHours) return <span>{t("ui.operatingHours.unavailable")}</span>;
    if (isOperatingHoursOpenNow(operatingHours, now)) {
      const today = getMalaysiaTodayKey(now);
      return <><span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" /><span className="font-bold text-emerald-700 dark:text-emerald-300">{t("ui.operatingHours.openNow")}</span> · {formatPeriods(operatingHours, today, t("ui.operatingHours.closed"), t("ui.operatingHours.unavailable"), t("ui.operatingHours.allDay"))}</>;
    }
    const next = getNextOpening(operatingHours, now);
    const day = next && (next.offsetDays === 0 ? t("ui.vendor.today") : next.offsetDays === 1 ? t("ui.vendor.tomorrow") : t(`ui.labels.days.${next.day}`));
    return <><span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-slate-400 align-middle" /><span className="font-bold text-red-600 dark:text-red-300">{t("ui.operatingHours.closedNow")}</span>{next && <> · {t("ui.vendor.opensAt", { day, time: next.time })}</>}</>;
  };
}

/** One OutletCard per outlet; four, then "Show all". Open now is worked out after mount, in the visitor's clock. */
export function VendorLocationList({ locations }: { locations: VendorLocationRow[] }) {
  const { t } = useTranslation("customer");
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);
  const shown = showAll ? locations : locations.slice(0, FIRST_PAGE);

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-5 lg:grid-cols-4">
        {shown.map((location) => (
          <OutletCard
            key={location.id}
            href={location.href}
            outlet={{
              id: location.id, name: location.name, vendorName: location.vendorName, city: location.city, state: location.state,
              imageUrl: location.imageUrl,
              rating: location.rating ?? undefined,
              openNow: now && location.operatingHours ? isOperatingHoursOpenNow(location.operatingHours, now) : undefined,
            }}
          />
        ))}
      </div>
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
