"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { scopedOutletIds } from "../layout";
import { getOrdersForOutlets } from "@/lib/db/repos/commerce";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { Order } from "@/lib/types";

export default function VendorBookingsPage() {
  const { activeVendorId, activeOutletIds } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(getOrdersForOutlets(scopedOutletIds(activeVendorId, activeOutletIds)));
  }, [activeVendorId, activeOutletIds]);

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Bookings & Orders</h1>
      {orders.length === 0 ? (
        <EmptyState title="No bookings yet" description="Orders that include your listings will appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-xl border border-border p-4 bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground">#{o.id}</span>
                <StatusBadge status={o.status} />
              </div>
              {o.items.map((item, i) => (
                <p key={i} className="text-sm text-foreground">{item.qty}× {item.activityName} ({item.variantLabel})</p>
              ))}
              <p className="text-xs text-muted-foreground mt-2">{new Date(o.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
