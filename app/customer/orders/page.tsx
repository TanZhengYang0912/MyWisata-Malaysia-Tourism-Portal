"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getOrdersForUser } from "@/backend/domains/commerce";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { Order } from "@/backend/core/types";

export default function OrdersPage() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (currentUser) getOrdersForUser(currentUser.id).then(setOrders);
  }, [currentUser]);

  if (orders === null) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package size={40} />}
        title="No orders yet"
        description="Your booking and order history will show up here once you check out."
        action={
          <Link href="/customer/explore">
            <Button>Explore Experiences</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">Order & Booking History</h1>
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/customer/orders/${order.id}`}
            className="block p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground font-[family-name:var(--font-mono)]">#{order.id}</span>
              <StatusBadge status={order.status} />
            </div>
            <div className="space-y-1 mb-2">
              {order.items.map((item, i) => (
                <p key={i} className="text-sm font-medium text-foreground">
                  {item.qty}× {item.activityName} <span className="text-muted-foreground">({item.variantLabel})</span>
                </p>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{new Date(order.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="font-bold text-primary font-[family-name:var(--font-mono)]">RM {order.total.toFixed(2)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
