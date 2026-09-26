"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  CreditCard,
  MapPin,
  Package,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { getBookingsForOrder, getOrder } from "@/backend/domains/commerce";
import { getOutlets } from "@/backend/domains/catalogue";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
import { BookingQrCode } from "@/components/customer/booking-qr-code";
import { FoodOrderQrCodes } from "@/components/customer/food-order-qr-codes";
import { Button } from "@/components/ui/button";
import type { Booking, Order, Outlet } from "@/backend/core/types";
import { productImageUrl } from "@/lib/storage/product-image";
import { formatMYR } from "@/lib/i18n/format";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { RefundRequestDialog } from "@/components/customer/refund-request-dialog";
import { useAuth } from "@/components/providers/auth";

function shortOrderId(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function dateLabel(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale === "en" ? "en-MY" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateTimeLabel(value: string, locale: string) {
  return new Date(value).toLocaleString(locale === "en" ? "en-MY" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function orderType(order: Order): "booking" | "product" | "mixed" {
  const hasBooking = order.items.some((item) => Boolean(item.slotStartsAt));
  const hasProduct = order.items.some((item) => !item.slotStartsAt);
  return hasBooking && hasProduct ? "mixed" : hasBooking ? "booking" : "product";
}

function typeLabelKey(type: "booking" | "product" | "mixed") {
  return type === "mixed"
    ? "ui.orders.mixedOrder"
    : type === "booking"
    ? "ui.orders.bookingOrder"
    : "ui.orders.productOrder";
}

type PaymentResumeResult = {
  canResume: boolean;
  url?: string;
  reason?: "expired" | "processing" | "unsupported";
};

type PaymentResumeState = "idle" | "checking" | "ready" | "expired" | "processing" | "unavailable" | "error";

async function fetchPaymentResume(orderId: string): Promise<PaymentResumeResult> {
  const response = await fetch(`/api/customer/orders/${encodeURIComponent(orderId)}/payment-session`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.data) throw new Error("payment_session_unavailable");
  return body.data as PaymentResumeResult;
}

function mapPaymentResumeState(result: PaymentResumeResult): PaymentResumeState {
  if (result.canResume && result.url) return "ready";
  if (result.reason === "expired") return "expired";
  if (result.reason === "processing") return "processing";
  return "unavailable";
}

function isTrustedPaymentRedirect(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin) {
      return /^\/customer\/checkout\/simulator\/[0-9a-f-]+$/i.test(url.pathname);
    }
    return url.protocol === "https:"
      && ["checkout.stripe.com", "toyyibpay.com", "dev.toyyibpay.com"].includes(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function OrderStatusBadge({ status, refundedLabel }: { status: string; refundedLabel: string }) {
  if (status !== "REFUNDED") return <StatusBadge status={status} />;
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[0.625rem] font-bold text-muted-foreground">
      {refundedLabel}
    </span>
  );
}

export default function OrderDetailPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const params = useParams<{ id: string }>();
  const { currentUser } = useAuth();

  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [copiedId, setCopiedId] = useState(false);
  const [paymentResume, setPaymentResume] = useState<{ orderId: string; state: PaymentResumeState }>({
    orderId: "",
    state: "checking",
  });

  // Refund Modal State (Figure 3 upgrade)
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [requestingRefund, setRequestingRefund] = useState(false);

  const locale = i18n.resolvedLanguage || i18n.language || "en";

  function paymentMethodLabel(method: string) {
    switch (method.toLowerCase()) {
      case "stripe_card": return tCustomer("ui.orders.paymentMethodStripeCard");
      case "wallet_split": return tCustomer("ui.orders.paymentMethodWalletAndCard");
      case "ewallet": return tCustomer("ui.orders.paymentMethodEWallet");
      case "bank_transfer": return tCustomer("ui.orders.paymentMethodBankTransfer");
      case "wallet":
      case "platform_wallet": return tCustomer("ui.orders.paymentMethodWallet");
      case "mock_card": return tCustomer("ui.orders.paymentMethodDemoCard");
      case "free_reservation": return tCustomer("ui.orders.paymentMethodNoPayment");
      default: return method.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [nextOrder, nextOutlets] = await Promise.all([getOrder(params.id), getOutlets()]);
        if (!active) return;
        setOrder(nextOrder ?? null);
        setOutlets(nextOutlets);
        if (nextOrder) {
          const nextBookings = await getBookingsForOrder(nextOrder.id);
          if (active) setBookings(nextBookings);
        }
      } catch {
        if (active) setOrder(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (!order || order.status !== "PENDING_PAYMENT") return;

    let active = true;
    fetchPaymentResume(order.id)
      .then((result) => {
        if (active) setPaymentResume({ orderId: order.id, state: mapPaymentResumeState(result) });
      })
      .catch(() => {
        if (active) setPaymentResume({ orderId: order.id, state: "error" });
      });
    return () => {
      active = false;
    };
  }, [order]);

  const outletMap = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);

  function copyOrderId() {
    if (!order) return;
    void navigator.clipboard.writeText(order.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  async function handleRefundSubmit(reason: string) {
    if (!order || requestingRefund) return;
    const fullReason = reason.trim();
    if (fullReason.length < 5) return;

    setRequestingRefund(true);
    setRefundMessage(null);

    try {
      const response = await fetch(`/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: fullReason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        setRefundMessage(tCustomer("ui.orders.refundSubmitted"));
        setRefundModalOpen(false);
      } else {
        setRefundMessage(payload.error?.message ?? tCustomer("ui.orders.refundError"));
      }
    } catch {
      setRefundMessage(tCustomer("ui.orders.refundError"));
    } finally {
      setRequestingRefund(false);
    }
  }

  async function handleContinuePayment() {
    if (!order || order.status !== "PENDING_PAYMENT") return;
    setPaymentResume({ orderId: order.id, state: "checking" });
    try {
      const result = await fetchPaymentResume(order.id);
      const nextState = mapPaymentResumeState(result);
      setPaymentResume({ orderId: order.id, state: nextState });
      if (nextState === "ready" && result.url && isTrustedPaymentRedirect(result.url)) {
        window.location.assign(result.url);
      } else if (nextState === "ready") {
        setPaymentResume({ orderId: order.id, state: "unavailable" });
      }
    } catch {
      setPaymentResume({ orderId: order.id, state: "error" });
    }
  }

  async function handleReviewCart() {
    if (!order || order.status !== "PENDING_PAYMENT") return;
    setPaymentResume({ orderId: order.id, state: "checking" });
    try {
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(order.id)}/payment-session`, {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("payment_session_close_failed");
      if (body.data?.canReviewCart) {
        window.location.assign("/customer/cart");
        return;
      }
      if (body.data?.reason === "processing") {
        setPaymentResume({ orderId: order.id, state: "processing" });
        return;
      }
      if (body.data?.reason === "active") {
        const result = await fetchPaymentResume(order.id);
        setPaymentResume({ orderId: order.id, state: mapPaymentResumeState(result) });
        return;
      }
      setPaymentResume({ orderId: order.id, state: "unavailable" });
    } catch {
      setPaymentResume({ orderId: order.id, state: "error" });
    }
  }

  if (order === undefined) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6">
        {tCustomer("ui.states.loading")}
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <EmptyState title={tCustomer("ui.states.noOrder")} />
      </div>
    );
  }

  const kind = orderType(order);
  const isPaid = order.status === "PAID" || order.status === "COMPLETED";
  const paymentResumeState = paymentResume.orderId === order.id ? paymentResume.state : "checking";
  const primaryOutlet = order.items.length > 0 ? outletMap.get(order.items[0].outletId) : undefined;
  const receiptNumber = `REC-${order.id.slice(0, 8).toUpperCase()}-${new Date(order.createdAt).toISOString().slice(0, 10).replace(/-/g, "")}`;

  return (
    <div className="min-h-full bg-background text-foreground">
      {/* ========================================================================= */}
      {/* 1. INTERACTIVE WEB VIEW (Figure 1 & Figure 2 Consistent Layout)          */}
      {/* ========================================================================= */}
      <div className="print:hidden">
        <CustomerPageTitle
          eyebrow={tCustomer("ui.labels.history")}
          title={isPaid ? tCustomer("ui.booking.confirmedInfo") : tCustomer("ui.booking.details")}
          description={tCustomer("ui.orders.description")}
          icon={<ReceiptText size={14} />}
          actions={
            <>
              <Link href="/customer/orders">
                <Button variant="outline" className="rounded-full border-primary/20 text-primary hover:bg-secondary">
                  <ArrowLeft size={14} className="mr-1.5" />
                  {tCustomer("ui.orders.backToOrders")}
                </Button>
              </Link>
              <Link href="/customer">
                <Button className="rounded-full bg-primary px-5 hover:bg-primary/90">
                  {tCustomer("ui.actions.continueExploring")}
                </Button>
              </Link>
            </>
          }
          className="mb-0"
        />

        <CustomerPageShell wide className="pt-4 sm:pt-6">
          {refundMessage && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-primary/20 bg-secondary/80 px-4 py-3 text-sm font-semibold text-primary shadow-sm">
              <span>{refundMessage}</span>
              <button
                type="button"
                onClick={() => setRefundMessage(null)}
                className="rounded-lg p-1 text-primary/70 hover:bg-primary/10 hover:text-primary"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Top Order Metadata Banner Card (Consistent with Figure 1 styling) */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={copyOrderId}
                  title={tCustomer("ui.orders.copyOrderId")}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-2.5 py-1 font-[family-name:var(--font-mono)] text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-secondary"
                >
                  <span>{shortOrderId(order.id)}</span>
                  {copiedId ? (
                    <Check size={12} className="text-primary" />
                  ) : (
                    <Copy size={12} className="text-muted-foreground group-hover:text-primary" />
                  )}
                </button>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  {tCustomer(typeLabelKey(kind))}
                </span>
                <OrderStatusBadge status={order.status} refundedLabel={tCustomer("ui.orders.refunded")} />
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CalendarDays size={14} className="text-primary" />
                <span>{dateTimeLabel(order.createdAt, locale)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Left Column: Order Items & Experience Details (2 Cols) */}
            <div className="space-y-6 lg:col-span-2">
              <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
                  <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                    {tCustomer("ui.orders.orderItems")}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-border/60">
                  {order.items.map((item, index) => {
                    const itemOutlet = outletMap.get(item.outletId);
                    return (
                      <article
                        key={index}
                        className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5 sm:gap-5 transition hover:bg-secondary/20"
                      >
                        {/* Thumbnail Image matching Figure 1 */}
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary text-primary shadow-sm sm:h-24 sm:w-24">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={productImageUrl(item.imageUrl) || ""}
                              alt={item.activityName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent">
                              {item.slotStartsAt ? (
                                <CalendarDays size={26} className="opacity-80" />
                              ) : (
                                <Package size={26} className="opacity-80" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Middle Details */}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-foreground sm:text-lg">
                            {item.activityName}
                          </h3>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            <span className="rounded-md bg-secondary px-2 py-0.5 text-primary">
                              {item.qty}×{item.variantLabel ? ` ${item.variantLabel}` : ""}
                            </span>
                          </p>
                          {itemOutlet && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin size={13} className="shrink-0 text-primary" />
                              <span className="break-words whitespace-normal font-medium">{itemOutlet.name}</span>
                              {(itemOutlet.city || itemOutlet.state) && (
                                <span className="break-words whitespace-normal text-muted-foreground/70">
                                  · {itemOutlet.city || itemOutlet.state}
                                </span>
                              )}
                            </p>
                          )}
                          {item.slotStartsAt && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-primary font-medium">
                              <Clock3 size={13} className="shrink-0" />
                              <span>{dateTimeLabel(item.slotStartsAt, locale)}</span>
                            </p>
                          )}
                        </div>

                        {/* Far Right Line Price */}
                        <div className="text-left sm:text-right">
                          <span className="font-[family-name:var(--font-mono)] text-base font-bold text-foreground sm:text-lg">
                            {formatMYR(item.unitPrice * item.qty)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {item.qty} × {formatMYR(item.unitPrice)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* Digital Entry Pass / QR Codes if Bookings exist */}
              {bookings.length > 0 && isPaid && (
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
                    <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                      {tCustomer("ui.booking.entryPass")}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tCustomer("ui.booking.scanAtOutlet")}
                    </p>
                  </div>
                  <div>
                    {bookings.map((b) => (
                      <CustomerQrPassCard
                        key={b.id}
                        title={b.activityName}
                        merchantLabel={outletMap.get(b.outletId)?.vendorName
                          ? tCustomer("ui.labels.providedBy", { vendor: outletMap.get(b.outletId)?.vendorName })
                          : undefined}
                        outletLabel={outletMap.get(b.outletId)?.name
                          ? `${tCustomer("ui.labels.outlet")}: ${outletMap.get(b.outletId)?.name}`
                          : undefined}
                        qr={
                          <BookingQrCode
                            className="w-full"
                            bookingId={b.id}
                            orderId={order.id}
                            size={176}
                            passToken={b.passToken}
                            policy={b.policy}
                            entryLimit={b.entryLimit}
                            entriesUsed={b.entriesUsed}
                            validUntil={b.validUntil}
                          />
                        }
                      >
                        {b.slotStartsAt && (
                          <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
                            <CalendarDays size={15} className="shrink-0 text-primary" aria-hidden="true" />
                            <span>{dateTimeLabel(b.slotStartsAt, locale)}</span>
                          </p>
                        )}
                        <div className="mt-3 flex min-w-0 flex-col gap-1 border-t border-border pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {tCustomer("ui.labels.bookingReference")}
                          </p>
                          <p className="break-all font-[family-name:var(--font-mono)] text-xs font-semibold text-primary">
                            {b.id}
                          </p>
                        </div>
                      </CustomerQrPassCard>
                    ))}
                  </div>
                </section>
              )}
              {isPaid && <FoodOrderQrCodes orderId={order.id} />}
            </div>

            {/* Right Column: Order Summary & Quick Action Card (1 Col) */}
            <div className="space-y-6">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-primary border-b border-border pb-3">
                  {tCustomer("ui.checkout.orderSummary")}
                </h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{tCustomer("ui.checkout.subtotal")}</span>
                    <span className="font-[family-name:var(--font-mono)] font-semibold text-foreground">
                      {formatMYR(order.subtotal)}
                    </span>
                  </div>

                  {order.discount > 0 && (
                    <div className="flex justify-between text-nature-green">
                      <span>
                        {tCustomer("ui.checkout.discount")}{" "}
                        {order.voucherCode && (
                          <span className="rounded bg-nature-green/10 px-1.5 py-0.5 text-xs font-semibold">
                            {order.voucherCode}
                          </span>
                        )}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] font-semibold">
                        -{formatMYR(order.discount)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-border pt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-bold text-foreground">{tCustomer("ui.checkout.total")}</span>
                      <span className="font-[family-name:var(--font-mono)] text-2xl font-bold text-primary">
                        {formatMYR(order.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Metadata */}
                <div className="mt-5 rounded-xl bg-secondary/50 p-3.5 text-xs text-muted-foreground space-y-1.5 border border-border/50">
                  {order.paymentMethod && (
                    <div className="flex justify-between">
                      <span>{tCustomer("ui.checkout.paymentMethod")}</span>
                      <span className="font-semibold text-foreground">{paymentMethodLabel(order.paymentMethod)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{tCustomer("ui.labels.status")}</span>
                    <OrderStatusBadge status={order.status} refundedLabel={tCustomer("ui.orders.refunded")} />
                  </div>
                </div>

                {order.status === "PENDING_PAYMENT" && (
                  <section
                    data-payment-resume-panel="true"
                    aria-labelledby="pending-payment-heading"
                    className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100"
                  >
                    <h3 id="pending-payment-heading" className="font-semibold">
                      {tCustomer("ui.orders.pendingPayment")}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                      {tCustomer("ui.orders.pendingPaymentExplanation")}
                    </p>

                    {paymentResumeState === "checking" && (
                      <p className="mt-3 text-xs font-medium" role="status">
                        {tCustomer("ui.orders.checkingPayment")}
                      </p>
                    )}
                    {paymentResumeState === "ready" && (
                      <Button
                        type="button"
                        className="mt-3 w-full gap-2 rounded-xl"
                        onClick={handleContinuePayment}
                      >
                        <CreditCard size={15} />
                        {tCustomer("ui.orders.continuePayment")}
                      </Button>
                    )}
                    {paymentResumeState === "expired" && (
                      <>
                        <p className="mt-3 text-xs leading-relaxed">{tCustomer("ui.orders.paymentLinkExpired")}</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full gap-2 rounded-xl border-amber-300 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900/40"
                          onClick={handleReviewCart}
                        >
                          {tCustomer("ui.orders.reviewCart")}
                        </Button>
                      </>
                    )}
                    {paymentResumeState === "processing" && (
                      <>
                        <p className="mt-3 text-xs leading-relaxed">{tCustomer("ui.orders.paymentProcessing")}</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full gap-2 rounded-xl border-amber-300 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900/40"
                          onClick={() => window.location.reload()}
                        >
                          <RefreshCw size={14} />
                          {tCustomer("ui.orders.checkPaymentAgain")}
                        </Button>
                      </>
                    )}
                    {(paymentResumeState === "unavailable" || paymentResumeState === "error") && (
                      <>
                        <p className="mt-3 text-xs leading-relaxed">{tCustomer("ui.orders.paymentLinkUnavailable")}</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full gap-2 rounded-xl border-amber-300 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-900/40"
                          onClick={handleContinuePayment}
                        >
                          <RefreshCw size={14} />
                          {tCustomer("ui.orders.checkPaymentAgain")}
                        </Button>
                      </>
                    )}
                  </section>
                )}

                {/* Actions */}
                <div className="mt-6 flex flex-col gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 rounded-xl"
                    onClick={() => window.print()}
                  >
                    <Printer size={15} />
                    {tCustomer("ui.actions.printReceipt")}
                  </Button>

                  {isPaid && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 rounded-xl text-amber-700 hover:bg-amber-50 hover:border-amber-300 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      onClick={() => setRefundModalOpen(true)}
                    >
                      <RotateCcw size={15} />
                      {tCustomer("ui.actions.requestRefund")}
                    </Button>
                  )}

                  <Link href="/customer/activity" className="w-full">
                    <Button variant="ghost" className="w-full rounded-xl text-muted-foreground hover:text-foreground">
                      {tCustomer("navigation.activity")}
                    </Button>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </CustomerPageShell>
      </div>

      {/* ========================================================================= */}
      {/* 2. MODERN REFUND REQUEST MODAL (Figure 3 Upgrade)                         */}
      {/* ========================================================================= */}
      <RefundRequestDialog
        open={refundModalOpen}
        summary={`${shortOrderId(order.id)} · ${formatMYR(order.total)}`}
        items={order.items.map((item) => ({
          qty: item.qty,
          label: `${item.activityName}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
        }))}
        submitting={requestingRefund}
        onCancel={() => setRefundModalOpen(false)}
        onConfirm={(reason) => void handleRefundSubmit(reason)}
      />

      {/* ========================================================================= */}
      {/* 3. DEDICATED OFFICIAL PRINTABLE RECEIPT (Figure 4 Optimization)            */}
      {/* ========================================================================= */}
      <div className="hidden print:block p-8 bg-white text-gray-900 font-sans max-w-4xl mx-auto leading-normal">
        {/* Official Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-primary">{tCustomer("ui.orders.brandName")}</span>
              <span className="text-xs uppercase tracking-widest text-gray-500">{tCustomer("ui.orders.portalName")}</span>
            </div>
            <h1 className="mt-3 text-xl font-bold uppercase tracking-wider text-gray-900">
              {tCustomer("ui.orders.taxInvoice")}
            </h1>
            <p className="mt-1 text-xs text-gray-500 font-mono">
              {tCustomer("ui.orders.receiptNo")}: {receiptNumber}
            </p>
          </div>
          <div className="text-right">
            <div className="inline-block border-2 border-emerald-600 px-3 py-1 text-emerald-700 font-black text-sm uppercase tracking-widest rounded">
              {tCustomer("ui.orders.paidStamp")}
            </div>
            <p className="mt-2 text-xs text-gray-600">
              {tCustomer("ui.orders.orderDate")}: {dateLabel(order.createdAt, locale)}
            </p>
            <p className="text-xs font-mono text-gray-500">
              {tCustomer("ui.orders.orderId", { id: order.id })}
            </p>
          </div>
        </div>

        {/* Parties Grid (Merchant & Customer) */}
        <div className="grid grid-cols-2 gap-8 py-6 border-b border-gray-200 text-xs">
          <div>
            <p className="font-bold uppercase tracking-wider text-gray-400">
              {tCustomer("ui.orders.merchant")}
            </p>
            <p className="mt-1 font-bold text-sm text-gray-900">
              {primaryOutlet?.name || "MyLawatan Marketplace Merchant"}
            </p>
            {primaryOutlet?.city && (
              <p className="text-gray-600 mt-0.5">
                {primaryOutlet.city}, {primaryOutlet.state || "Malaysia"}
              </p>
            )}
          </div>
          <div>
            <p className="font-bold uppercase tracking-wider text-gray-400">
              {tCustomer("ui.orders.issuedTo")}
            </p>
            <p className="mt-1 font-bold text-sm text-gray-900">
              {currentUser?.name || "Customer"}
            </p>
            <p className="text-gray-600 mt-0.5">{currentUser?.email || ""}</p>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="py-6">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-900 font-bold uppercase tracking-wider text-gray-700">
                <th className="py-2.5 w-10">#</th>
                <th className="py-2.5">{tCustomer("ui.orders.itemColumn")}</th>
                <th className="py-2.5 w-20 text-center">{tCustomer("ui.orders.qtyColumn")}</th>
                <th className="py-2.5 w-28 text-right">{tCustomer("ui.orders.unitPriceColumn")}</th>
                <th className="py-2.5 w-28 text-right">{tCustomer("ui.orders.amountColumn")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {order.items.map((item, idx) => (
                <tr key={idx} className="break-inside-avoid">
                  <td className="py-3 text-gray-400 font-mono">{idx + 1}</td>
                  <td className="py-3 pr-4">
                    <p className="font-bold text-gray-900">{item.activityName}</p>
                    {item.variantLabel && <p className="text-gray-500 text-[11px]">{item.variantLabel}</p>}
                    {item.slotStartsAt && (
                      <p className="text-gray-500 text-[11px] font-medium">
                        {tCustomer("ui.orders.slot", { time: dateTimeLabel(item.slotStartsAt, locale) })}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-center font-mono">{item.qty}</td>
                  <td className="py-3 text-right font-mono">{formatMYR(item.unitPrice)}</td>
                  <td className="py-3 text-right font-mono font-bold">{formatMYR(item.unitPrice * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="border-t border-gray-900 pt-4 flex justify-end">
          <div className="w-64 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>{tCustomer("ui.checkout.subtotal")}</span>
              <span className="font-mono">{formatMYR(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>{tCustomer("ui.checkout.discount")} {order.voucherCode ? `(${order.voucherCode})` : ""}</span>
                <span className="font-mono">-{formatMYR(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-gray-900 pt-2 text-sm font-black text-gray-900">
              <span>{tCustomer("ui.checkout.total")}</span>
              <span className="font-mono">{formatMYR(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Verification QR Pass (if applicable) */}
        {bookings.length > 0 && isPaid && (
          <div className="mt-8 border border-gray-300 rounded-xl p-4 break-inside-avoid">
            <div className="mb-4">
              <p className="font-bold text-sm text-gray-900 uppercase tracking-wide">
                {tCustomer("ui.booking.entryPass")}
              </p>
              <p className="text-xs text-gray-600 mt-1 max-w-sm">
                {tCustomer("ui.booking.scanAtOutlet")}
              </p>
            </div>
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 break-inside-avoid border-t border-gray-200 pt-4 first:border-t-0 first:pt-0">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{booking.activityName}</p>
                    <p className="text-[11px] font-mono text-gray-500 mt-2">
                      {tCustomer("ui.orders.bookingId", { id: booking.id })}
                    </p>
                  </div>
                  <div className="p-1 border border-gray-200 rounded-lg">
                    <BookingQrCode
                      bookingId={booking.id}
                      orderId={order.id}
                      size={96}
                      passToken={booking.passToken}
                      policy={booking.policy}
                      entryLimit={booking.entryLimit}
                      entriesUsed={booking.entriesUsed}
                      validUntil={booking.validUntil}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legal & Support Footer */}
        <div className="mt-12 border-t border-gray-200 pt-4 text-center text-[10px] text-gray-400">
          <p>{tCustomer("ui.orders.printNotice")}</p>
        </div>
      </div>
    </div>
  );
}
