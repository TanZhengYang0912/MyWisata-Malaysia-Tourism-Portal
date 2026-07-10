"use client";

import { useEffect, useState } from "react";
import { Bell, Calendar, DollarSign, MessageCircle, Package } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { scopedOutletIds } from "../layout";
import { getActivities, getOutlets } from "@/lib/db/repos/catalogue";
import { getOrdersForOutlets } from "@/lib/db/repos/commerce";
import { getThreadsForOutlets, getMessages } from "@/lib/db/repos/identity";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Order } from "@/lib/types";

export default function VendorDashboardPage() {
  const { activeVendorId, activeOutletIds, currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [outletIds, setOutletIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = scopedOutletIds(activeVendorId, activeOutletIds);
    setOutletIds(ids);
    setOrders(getOrdersForOutlets(ids));
  }, [activeVendorId, activeOutletIds]);

  const listings = getActivities().filter((a) => outletIds.includes(a.outletId));
  const outlets = getOutlets().filter((o) => outletIds.includes(o.id));
  const threads = getThreadsForOutlets(outletIds);
  const unreadThreads = threads.filter((t) => {
    const msgs = getMessages(t.id);
    const last = msgs[msgs.length - 1];
    return last && last.senderRole === "customer";
  });

  const revenue = orders.filter((o) => o.status === "PAID" || o.status === "COMPLETED").reduce((sum, o) => sum + o.total, 0);

  const metrics = [
    { label: "Revenue (Demo)", value: `RM ${revenue.toFixed(2)}`, icon: DollarSign },
    { label: "Orders", value: String(orders.length), icon: Calendar },
    { label: "Active Listings", value: String(listings.length), icon: Package },
    { label: "Unread Chats", value: String(unreadThreads.length), icon: MessageCircle },
  ];

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-bold text-lg text-foreground">Dashboard Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Welcome back, {currentUser?.name} — here's your demo summary</p>
        </div>
        <Bell size={18} className="text-foreground" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl p-5 bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-primary/15 text-primary">
              <m.icon size={18} />
            </div>
            <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">{m.value}</p>
            <p className="text-xs mt-0.5 text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Recent Orders</h2>
        </div>
        {orders.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">No orders yet for your outlets.</p>
        ) : (
          <div className="divide-y divide-border">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="px-6 py-3.5 flex items-center gap-4">
                <span className="text-xs font-mono text-muted-foreground shrink-0">#{o.id}</span>
                <span className="flex-1 text-sm text-foreground truncate">{o.items.map((i) => i.activityName).join(", ")}</span>
                <StatusBadge status={o.status} />
                <span className="text-sm font-bold text-primary font-[family-name:var(--font-mono)] shrink-0">RM {o.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Your Outlets</h2>
        </div>
        <div className="divide-y divide-border">
          {outlets.map((o) => (
            <div key={o.id} className="px-6 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.city}, {o.state}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${o.open ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {o.open ? "Open" : "Closed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
