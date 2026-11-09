"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CalendarDays, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
import { BookingQrCode } from "@/components/customer/booking-qr-code";
import { CustomerQrPassSection } from "@/components/customer/customer-qr-pass-section";
import { EventPickupQrCodes } from "@/components/customer/event-pickup-qr-codes";
import { FoodOrderQrCodes } from "@/components/customer/food-order-qr-codes";
import { PickupCodeCopy } from "@/components/customer/pickup-code-copy";
import { EnlargeableQrCode } from "@/components/customer/enlargeable-qr-code";
import { useAuth } from "@/components/providers/auth";
import { getCustomerPassQrOptions } from "@/lib/customer/pass-qr-options";

type FoodPass = {
  outletId: string; outletName: string; vendorName: string; mode: "dine_in" | "takeaway";
  status: "pending" | "checked_in" | "fulfilled"; items: { name: string; variant: string | null; quantity: number }[]; foodToken: string; foodCode: string | null;
};
type TicketPresentation = {
  bookingId: string;
  activityName: string;
  vendorName: string | null;
  outletName: string | null;
  slotLabel: string | null;
  passToken?: string;
  policy?: "single_entry" | "multi_entry" | "group_entry";
  entryLimit?: number;
  entriesUsed?: number;
  validUntil?: string | null;
};
type TicketPass = {
  bookingId: string;
  vendorName: string;
  outletName: string;
  passToken: string;
  ticketCode: string | null;
  policy: "single_entry" | "multi_entry" | "group_entry";
  entryLimit: number;
  entriesUsed: number;
  status: string;
  validUntil: string | null;
};
type EventPass = {
  vendorName: string; pickupDate: string; pickupLabels: string[]; status: "pending" | "collected";
  items: { name: string; quantity: number }[]; eventToken: string; eventCode: string | null;
};
type RetailPass = {
  orderItemId: string; vendorName: string; outletName: string;
  status: "pending" | "collected" | "legacy_completed" | "refund_paused" | "unavailable";
  quantity: number; name: string; variant: string | null; retailToken: string | null; retailCode: string | null;
};
type PickupData = { tickets: TicketPass[]; foodOrders: Array<FoodPass & { qr: string }>; eventPickups: Array<EventPass & { qr: string }>; retailPickups: Array<RetailPass & { qr: string }> };

export function OrderPickupQrCodes({ orderId, tickets: ticketPresentations = [] }: { orderId: string; tickets?: TicketPresentation[] }) {
  const { t } = useTranslation("customer");
  const { currentUser } = useAuth();
  const ownerKey = currentUser?.id ?? "guest-session";
  const [data, setData] = useState<{ ownerKey: string; value: PickupData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorOwnerKey, setErrorOwnerKey] = useState<string | null>(null);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestRef.current;
    setLoading(true);
    setErrorOwnerKey(null);
    try {
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(orderId)}/qr-passes`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { data?: { tickets?: TicketPass[]; foodOrders?: FoodPass[]; eventPickups?: EventPass[]; retailPickups?: RetailPass[] } };
      if (!response.ok || !payload.data) throw new Error("pickup_passes_unavailable");
      const [foodOrders, eventPickups, retailPickups] = await Promise.all([
        Promise.all((payload.data.foodOrders ?? []).map(async (pass) => pass.status === "pending" && pass.foodCode
          ? ({ ...pass, qr: await QRCode.toDataURL(pass.foodCode.replace(/-/g, ""), getCustomerPassQrOptions(512)) })
          : ({ ...pass, qr: "" }))),
        Promise.all((payload.data.eventPickups ?? []).map(async (pass) => pass.status === "pending" && pass.eventCode
          ? ({ ...pass, qr: await QRCode.toDataURL(pass.eventCode.replace(/-/g, ""), getCustomerPassQrOptions(512)) })
          : ({ ...pass, qr: "" }))),
        Promise.all((payload.data.retailPickups ?? []).map(async (pass) => pass.retailToken && pass.retailCode
          ? ({ ...pass, qr: await QRCode.toDataURL(pass.retailCode.replace(/-/g, ""), getCustomerPassQrOptions(512)) })
          : ({ ...pass, qr: "" }))),
      ]);
      if (requestId === requestRef.current && !controller.signal.aborted) {
        setData({ ownerKey, value: { tickets: payload.data.tickets ?? [], foodOrders, eventPickups, retailPickups } });
      }
    } catch {
      if (!controller.signal.aborted && requestId === requestRef.current) {
        setErrorOwnerKey(ownerKey);
      }
    } finally {
      if (requestId === requestRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [orderId, ownerKey]);

  useEffect(() => {
    // A different signed-in customer must never see the previous request's QR.
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      controllerRef.current?.abort();
      requestRef.current += 1;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ownerKey, refresh]);

  const currentData = data?.ownerKey === ownerKey ? data.value : null;
  const hasError = errorOwnerKey === ownerKey;
  const isLoading = loading || (!currentData && !hasError);

  if (hasError) return <div role="alert" className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
    <p>{t("ui.pickupPasses.loadError")}</p>
    <Button type="button" variant="outline" onClick={() => void refresh()} className="mt-3"><RefreshCw size={14} />{t("ui.pickupPasses.retry")}</Button>
  </div>;
  if (isLoading && !currentData) return <div role="status" className="mt-6 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">{t("ui.pickupPasses.loading")}</div>;
  if (!currentData) return null;
  const refreshedTicketByBookingId = new Map(currentData.tickets.map((ticket) => [ticket.bookingId, ticket]));
  const visibleTickets = ticketPresentations.map((presentation) => {
    const refreshedTicket = refreshedTicketByBookingId.get(presentation.bookingId);
    return { ...presentation, ...(refreshedTicket ?? {}) };
  });
  const hasPasses = visibleTickets.length + currentData.foodOrders.length + currentData.eventPickups.length + currentData.retailPickups.length > 0;
  if (!hasPasses) return null;

  const refreshAction = (heading: string) => <Button type="button" variant="outline" size="sm" aria-label={`${t("ui.pickupPasses.refresh")} ${heading}`} onClick={() => void refresh()} disabled={loading}>
    <RefreshCw size={14} aria-hidden="true" />{t("ui.pickupPasses.refresh")}
  </Button>;

  return <div className="space-y-4">
    {visibleTickets.length > 0 && <CustomerQrPassSection headingId="entry-pass-heading" title={t("ui.booking.entryPass")} action={refreshAction(t("ui.booking.entryPass"))}>
      {visibleTickets.map((ticket) => {
        const ticketCode = ticket.status === "active" ? ticket.ticketCode ?? null : null;
        return <CustomerQrPassCard
          key={ticket.bookingId}
          title={ticket.activityName}
          outletLabel={ticket.outletName ? `${t("ui.labels.outlet")}: ${ticket.outletName}` : undefined}
          mobileStacked
          qr={<BookingQrCode
            className="w-full"
            bookingId={ticket.bookingId}
            orderId={orderId}
            size={176}
            passToken={ticket.passToken}
            policy={ticket.policy}
            entryLimit={ticket.entryLimit}
            entriesUsed={ticket.entriesUsed}
            validUntil={ticket.validUntil ?? undefined}
            qrPayload={ticketCode?.replace(/-/g, "")}
            refreshManagedByParent
          />}
        >
          {ticket.slotLabel && <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarDays size={14} className="shrink-0 text-primary" aria-hidden="true" />
            <span>{ticket.slotLabel}</span>
          </p>}
          {ticketCode && <PickupCodeCopy code={ticketCode} />}
        </CustomerQrPassCard>;
      })}
    </CustomerQrPassSection>}
    {currentData.foodOrders.length > 0 && <FoodOrderQrCodes orderId={orderId} passes={currentData.foodOrders} onRefresh={() => void refresh()} parentRefreshing={loading} />}
    {currentData.eventPickups.length > 0 && <EventPickupQrCodes orderId={orderId} passes={currentData.eventPickups} onRefresh={() => void refresh()} parentRefreshing={loading} />}
    {currentData.retailPickups.length > 0 && <CustomerQrPassSection headingId="retail-pickup-qr-heading" title={t("ui.pickupPasses.retailTitle")} action={refreshAction(t("ui.pickupPasses.retailTitle"))}>
      {currentData.retailPickups.map((pass) => {
        const collectible = pass.status === "pending" && Boolean(pass.retailToken && pass.retailCode);
        const complete = pass.status === "collected" || pass.status === "legacy_completed";
        const tone = complete ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
          : collectible ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            : "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
        return <CustomerQrPassCard key={pass.orderItemId} title={pass.name} outletLabel={`${t("ui.labels.outlet")}: ${pass.outletName}`} mobileStacked qr={collectible && pass.qr
          ? <EnlargeableQrCode src={pass.qr} alt={t("ui.pickupPasses.retailQrAlt", { product: pass.name })} />
          : <div className="grid aspect-square w-full place-items-center rounded-lg bg-muted text-center text-xs text-muted-foreground">{t("ui.pickupPasses.noActiveQr")}</div>}>
          {pass.variant && <p className="text-sm font-semibold text-foreground">{pass.variant}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.pickupPasses.quantity", { count: pass.quantity })}</p>
          {collectible && pass.retailCode && <PickupCodeCopy code={pass.retailCode} />}
          <Badge variant="outline" role="status" className={`mt-5 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold leading-snug [&>svg]:size-4 ${tone}`}>
            {complete ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            <span>{t(`ui.pickupPasses.status.${pass.status}`)}</span>
          </Badge>
        </CustomerQrPassCard>;
      })}
    </CustomerQrPassSection>}
  </div>;
}
