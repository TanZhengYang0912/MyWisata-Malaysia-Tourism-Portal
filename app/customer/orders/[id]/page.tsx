"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, QrCode } from "lucide-react";
import { getBookingsForOrder, getOrder } from "@/backend/domains/commerce";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { Booking, Order } from "@/backend/core/types";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const o = getOrder(params.id) ?? null;
    setOrder(o);
    if (o) setBookings(getBookingsForOrder(o.id));
  }, [params.id]);

  if (order === undefined) {
    return <div className="max-w-lg mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }
  if (order === null) {
    return <EmptyState title="Order not found" />;
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      {order.status === "PAID" || order.status === "COMPLETED" ? (
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-primary/15">
            <CheckCircle2 size={36} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">Booking Confirmed!</h1>
          <p className="text-sm text-muted-foreground">Your adventure is locked in.</p>
        </div>
      ) : (
        <h1 className="text-xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">Order Details</h1>
      )}

      <div className="rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground font-[family-name:var(--font-mono)]">#{order.id}</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="space-y-2 mb-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-foreground">{item.qty}× {item.activityName} ({item.variantLabel})</span>
              <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">RM {(item.unitPrice * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-border space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal</span><span>RM {order.subtotal.toFixed(2)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Discount {order.voucherCode && `(${order.voucherCode})`}</span><span>− RM {order.discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-foreground pt-1">
            <span>Total Paid</span><span className="text-primary font-[family-name:var(--font-mono)]">RM {order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {bookings.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-sm font-bold text-foreground">Your Bookings</p>
          {bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-border p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
                <QrCode size={32} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{b.activityName}</p>
                {b.slotStartsAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.slotStartsAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{b.qrCode} (Demo QR)</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link href="/customer/orders">
        <Button variant="outline" className="w-full">Back to Order History</Button>
      </Link>
    </div>
  );
}
