"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { scopedOutletIds } from "@/lib/vendor-scope";
import { getActivities, getOutlets } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { Activity, Outlet } from "@/backend/core/types";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

export default function VendorListingsPage() {
  const { t } = useTranslation("vendor");
  const { activeVendorId, activeOutletIds } = useAuth();
  const [listings, setListings] = useState<Activity[]>([]);
  const [outlets, setOutlets] = useState<Map<string, Outlet>>(new Map());

  useEffect(() => {
    (async () => {
      const outletIds = await scopedOutletIds(activeVendorId, activeOutletIds);
      const [activities, allOutlets] = await Promise.all([getActivities(), getOutlets()]);
      setListings(activities.filter((a) => outletIds.includes(a.outletId)));
      setOutlets(new Map(allOutlets.map((o) => [o.id, o])));
    })();
  }, [activeVendorId, activeOutletIds]);

  return (
    <div>
      <h1 className="font-bold text-lg text-foreground mb-6">{t("ui.listings.title")}</h1>
      {listings.length === 0 ? (
        <EmptyState title={t("ui.listings.emptyTitle")} description={t("ui.listings.emptyDescription")} />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                {[t("ui.listings.listing"), t("ui.listings.outlet"), t("ui.listings.category"), t("ui.listings.bookingRequired"), t("ui.listings.price")].map((h) => (
                  <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="px-6 py-4 font-semibold text-sm text-foreground">{l.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{outlets.get(l.outletId)?.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{l.category}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{l.requiresBooking ? t("ui.common.yes") : t("ui.common.no")}</td>
                  <td className="px-6 py-4 text-sm font-bold text-primary font-[family-name:var(--font-mono)]">{MYR_CODE} {l.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
