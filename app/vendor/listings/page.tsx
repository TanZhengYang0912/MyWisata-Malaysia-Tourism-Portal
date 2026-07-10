"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { scopedOutletIds } from "../layout";
import { getActivities, getOutlet } from "@/lib/db/repos/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { Activity } from "@/lib/types";

export default function VendorListingsPage() {
  const { activeVendorId, activeOutletIds } = useAuth();
  const [listings, setListings] = useState<Activity[]>([]);

  useEffect(() => {
    const outletIds = scopedOutletIds(activeVendorId, activeOutletIds);
    setListings(getActivities().filter((a) => outletIds.includes(a.outletId)));
  }, [activeVendorId, activeOutletIds]);

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Product Catalogue</h1>
      {listings.length === 0 ? (
        <EmptyState title="No listings yet" description="Listings for your outlets will appear here once created." />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                {["Listing", "Outlet", "Category", "Booking Required", "Price"].map((h) => (
                  <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="px-6 py-4 font-semibold text-sm text-foreground">{l.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{getOutlet(l.outletId)?.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{l.category}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{l.requiresBooking ? "Yes" : "No"}</td>
                  <td className="px-6 py-4 text-sm font-bold text-primary font-[family-name:var(--font-mono)]">RM {l.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
