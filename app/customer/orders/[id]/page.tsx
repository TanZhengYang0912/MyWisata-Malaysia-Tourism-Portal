"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Package } from "lucide-react";
import { getBookingsForOrder, getOrder } from "@/backend/domains/commerce";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { BookingQrCode } from "@/components/customer/booking-qr-code";
import { Button } from "@/components/ui/button";
import type { Booking, Order } from "@/backend/core/types";
import { useAuth } from "@/components/providers/auth";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";

export default function OrderDetailPage() {
  const { t: tCustomer } = useTranslation("customer");
  const params = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [requestingRefund, setRequestingRefund] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setOrder(undefined);
      setBookings([]);
      setLoadedUserId(null);
      return;
    }
    let active = true;
    (async () => {
      const o = (await getOrder(params.id)) ?? null;
      if (!active) return;
      const ownedOrder = o?.userId === currentUser.id ? o : null;
      setOrder(ownedOrder);
      setBookings(ownedOrder ? await getBookingsForOrder(ownedOrder.id) : []);
      if (active) setLoadedUserId(currentUser.id);
    })();
    return () => { active = false; };
  }, [currentUser, params.id]);

  async function requestRefund() {
    if (!currentUser || !order || order.userId !== currentUser.id || requestingRefund) return;
    const reason = window.prompt(tCustomer("ui.support.message"));
    if (!reason || reason.trim().length < 5) return;
    setRequestingRefund(true);
    const response = await fetch(`/api/orders/${order.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const payload = await response.json().catch(() => ({}));
    setRefundMessage(response.ok ? tCustomer("ui.actions.requestRefund", { defaultValue: "Request refund" }) : payload.error?.message ?? tCustomer("ui.states.loadingError"));
    setRequestingRefund(false);
  }

  if (!currentUser) {
    return <div className="mx-auto max-w-lg px-4 py-10 sm:px-6"><GuestAccountEmptyState title={tCustomer("ui.states.noOrder")} description={tCustomer("ui.guest.accountHint")} nextPath={`/customer/orders/${params.id}`} /></div>;
  }
  if (order === undefined || loadedUserId !== currentUser.id) {
    return <div className="max-w-lg mx-auto px-6 py-16 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div>;
  }
  if (order === null) {
    return <EmptyState title={tCustomer("ui.states.noOrder")} />;
  }

  return (
    <div className="order-receipt-page mx-auto max-w-lg px-4 py-8 sm:px-6 print:max-w-none print:px-0 print:py-0">
      {order.status === "PAID" || order.status === "COMPLETED" ? (
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-primary/15">
            <CheckCircle2 size={36} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">{tCustomer("ui.booking.confirmedInfo")}</h1>
          <p className="text-sm text-muted-foreground">{tCustomer("ui.booking.entryPass")}</p>
        </div>
      ) : (
        <h1 className="text-xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">{tCustomer("ui.booking.details")}</h1>
      )}

      <div className="rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground font-[family-name:var(--font-mono)]">#{order.id}</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="space-y-2 mb-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-primary print:h-16 print:w-16">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.activityName} className="h-full w-full object-cover" /> : <Package size={22} />}
              </div>
              <span className="min-w-0 flex-1 text-foreground">{item.qty}× {item.activityName} ({item.variantLabel})</span>
              <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">RM {(item.unitPrice * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-border space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{tCustomer("ui.checkout.subtotal")}</span><span>RM {order.subtotal.toFixed(2)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{tCustomer("ui.checkout.discount")} {order.voucherCode && `(${order.voucherCode})`}</span><span>− RM {order.discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-foreground pt-1">
            <span>{tCustomer("ui.checkout.total")}</span><span className="text-primary font-[family-name:var(--font-mono)]">RM {order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {bookings.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-sm font-bold text-foreground">{tCustomer("ui.labels.bookings")}</p>
          {bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-border p-4 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-primary/10 p-1">
                <BookingQrCode bookingId={b.id} size={72} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{b.activityName}</p>
                {b.slotStartsAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.slotStartsAt).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <p className="mt-0.5 truncate text-xs font-mono text-muted-foreground">{tCustomer("ui.labels.bookingReference")}: {b.id}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 print:hidden">
        {(order.status === "PAID" || order.status === "COMPLETED") && <Button type="button" variant="outline" className="flex-1" disabled={requestingRefund} onClick={() => void requestRefund()}>{requestingRefund ? tCustomer("ui.states.submitting", { defaultValue: "Submitting…" }) : tCustomer("ui.actions.requestRefund", { defaultValue: "Request refund" })}</Button>}
        <Button type="button" variant="outline" className="flex-1" onClick={() => window.print()}>{tCustomer("ui.actions.printReceipt", { defaultValue: "Print receipt" })}</Button>
        <Link href="/customer/activity?tab=orders" className="flex-1"><Button variant="outline" className="w-full">Back to Order History</Button></Link>
        <Link href="/customer/activity" className="flex-1"><Button variant="outline" className="w-full">{tCustomer("ui.labels.history")}</Button></Link>
        <Link href="/customer" className="flex-1"><Button className="w-full">{tCustomer("ui.actions.continueExploring", { defaultValue: "Continue exploring" })}</Button></Link>
      </div>
      {refundMessage && <p className="mt-3 text-center text-xs font-semibold text-primary">{refundMessage}</p>}
    </div>
  );
}
