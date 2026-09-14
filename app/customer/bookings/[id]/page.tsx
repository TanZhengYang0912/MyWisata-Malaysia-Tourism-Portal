"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, MapPin, Printer, ReceiptText, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { getBookingForUser, getBookingsForOrder } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { useAuth } from "@/components/providers/auth";
import { BookingQrCode } from "@/components/customer/booking-qr-code";
import { RefundRequestDialog } from "@/components/customer/refund-request-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import type { Booking, Outlet } from "@/backend/core/types";
import { hasDifferentBookingTime } from "@/lib/customer/booking-details";
import { formatBookingDate, formatBookingTime } from "@/lib/customer/itinerary-calendar";

export default function CustomerBookingDetailsPage() {
  const { t: tCustomer } = useTranslation("customer");
  const params = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [showFullReceipt, setShowFullReceipt] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [requestingRefund, setRequestingRefund] = useState(false);

  useEffect(() => {
    if (!currentUser || !params.id) return;
    let active = true;
    void Promise.all([getBookingForUser(currentUser.id, params.id), getOutlets()]).then(async ([nextBooking, nextOutlets]) => {
      if (!active) return;
      setBooking(nextBooking ?? null);
      setOutlets(nextOutlets);
      setShowFullReceipt(false);
      if (!nextBooking) return;
      try {
        const orderBookings = await getBookingsForOrder(nextBooking.orderId);
        if (active) setShowFullReceipt(hasDifferentBookingTime(nextBooking.id, orderBookings));
      } catch {
        if (active) setShowFullReceipt(false);
      }
    }).catch(() => {
      if (active) setBooking(null);
    });
    return () => {
      active = false;
    };
  }, [currentUser, params.id]);

  async function requestRefund(reason: string) {
    if (!booking || requestingRefund) return;
    setRequestingRefund(true);
    try {
      const response = await fetch(`/api/orders/${booking.orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await response.json().catch(() => ({}));
      if (response.ok) {
        setRefundModalOpen(false);
        setRefundMessage(tCustomer("ui.orders.refundSubmitted"));
      } else {
        setRefundMessage(tCustomer("ui.orders.refundError"));
      }
    } catch {
      setRefundMessage(tCustomer("ui.orders.refundError"));
    } finally {
      setRequestingRefund(false);
    }
  }

  if (booking === undefined) {
    return <main className="min-h-full bg-background"><CustomerPageShell wide className="py-16 text-sm text-muted-foreground sm:py-16">{tCustomer("ui.states.loadingYourBooking")}</CustomerPageShell></main>;
  }

  if (booking === null) {
    return <main className="min-h-full bg-background"><CustomerPageShell wide className="py-16 sm:py-16"><EmptyState title={tCustomer("ui.booking.notFound")} description={tCustomer("ui.booking.unavailable")} /></CustomerPageShell></main>;
  }

  const outletName = outlets.find((outlet) => outlet.id === booking.outletId)?.name ?? tCustomer("ui.labels.mywisataOutlet");

  return (
    <main className="min-h-full bg-background">
      <CustomerPageShell wide className="pb-0 sm:pb-0">
        <Link href="/customer/activity?tab=itinerary" className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30">
          <ArrowLeft size={16} aria-hidden="true" /> {tCustomer("ui.actions.backToCalendar")}
        </Link>
      </CustomerPageShell>

      <CustomerPageTitle
        eyebrow={tCustomer("strictMigration.bookingReceipt.eyebrow")}
        title={booking.activityName}
        description={tCustomer("strictMigration.bookingReceipt.description")}
        icon={<CalendarDays size={14} />}
        actions={<StatusBadge status={booking.status} />}
        className="mb-6"
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">
        <section className="mt-7 overflow-hidden rounded-3xl border border-border bg-card shadow-[0_12px_32px_rgba(1,0,102,0.06)]" aria-labelledby="booking-summary-heading">
          <div className="border-b border-border bg-secondary/45 px-5 py-5 sm:px-7">
            <h2 id="booking-summary-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-primary">{tCustomer("ui.booking.details")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.booking.confirmedInfo")}</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7">
            <div className="rounded-2xl border border-border bg-secondary/50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"><CalendarDays size={14} className="text-primary" /> {tCustomer("ui.labels.date")}</p>
              <p className="mt-3 text-sm font-bold text-foreground">{formatBookingDate(booking.slotStartsAt)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"><Clock3 size={14} className="text-primary" /> {tCustomer("ui.labels.time")}</p>
              <p className="mt-3 text-sm font-bold text-foreground">{formatBookingTime(booking.slotStartsAt)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"><MapPin size={14} className="text-primary" /> {tCustomer("ui.labels.location")}</p>
              <p className="mt-3 text-sm font-bold text-foreground">{outletName}</p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"><Users size={14} className="text-primary" /> {tCustomer("ui.labels.guests")}</p>
              <p className="mt-3 text-sm font-bold text-foreground">{tCustomer("strictMigration.bookingReceipt.guests", { count: booking.qty })}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:p-7" aria-labelledby="entry-heading">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl bg-secondary p-2 text-primary">
            <BookingQrCode
              bookingId={booking.id}
              size={112}
              passToken={booking.passToken}
              policy={booking.policy}
              entryLimit={booking.entryLimit}
              entriesUsed={booking.entriesUsed}
            />
          </div>
          <div className="min-w-0">
            <h2 id="entry-heading" className="text-base font-bold text-foreground">{tCustomer("ui.booking.entryPass")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.booking.scanAtOutlet")}</p>
            <p className="mt-2 truncate text-xs font-semibold text-primary">{tCustomer("strictMigration.bookingReceipt.reference", { reference: booking.id })}</p>
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 print:hidden">
          {booking.status === "confirmed" && <Button type="button" variant="outline" className="w-full gap-2" disabled={requestingRefund} onClick={() => setRefundModalOpen(true)}>{requestingRefund ? tCustomer("ui.actions.submitting") : tCustomer("ui.actions.requestRefund")}</Button>}
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => window.print()}><Printer size={16} /> {tCustomer("ui.actions.printReceipt")}</Button>
          {showFullReceipt && <Link href={`/customer/orders/${booking.orderId}`} className="w-full"><Button type="button" variant="outline" className="w-full gap-2"><ReceiptText size={16} /> {tCustomer("strictMigration.bookingReceipt.viewFullReceipt")}</Button></Link>}
        </div>
        {refundMessage && <p className="mt-3 text-center text-xs font-semibold text-primary">{refundMessage}</p>}
      </CustomerPageShell>
      <RefundRequestDialog
        open={refundModalOpen}
        summary={`${booking.activityName} · ${formatBookingDate(booking.slotStartsAt)}`}
        items={[{ qty: booking.qty, label: `${booking.activityName} · ${outletName}` }]}
        submitting={requestingRefund}
        onCancel={() => setRefundModalOpen(false)}
        onConfirm={(reason) => void requestRefund(reason)}
      />
    </main>
  );
}
