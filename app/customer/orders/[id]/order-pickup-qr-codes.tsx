"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
import { EventPickupQrCodes } from "@/components/customer/event-pickup-qr-codes";
import { FoodOrderQrCodes } from "@/components/customer/food-order-qr-codes";
import { useAuth } from "@/components/providers/auth";

type FoodPass = {
  outletId: string; outletName: string; vendorName: string; mode: "dine_in" | "takeaway";
  status: "pending" | "checked_in" | "fulfilled"; items: { name: string; variant: string | null; quantity: number }[]; foodToken: string;
};
type EventPass = {
  vendorName: string; pickupDate: string; pickupLabels: string[]; status: "pending" | "collected";
  items: { name: string; quantity: number }[]; eventToken: string;
};
type RetailPass = {
  orderItemId: string; vendorName: string; outletName: string;
  status: "pending" | "collected" | "legacy_completed" | "refund_paused" | "unavailable";
  quantity: number; name: string; variant: string | null; retailToken: string | null;
};
type PickupData = { foodOrders: Array<FoodPass & { qr: string }>; eventPickups: Array<EventPass & { qr: string }>; retailPickups: Array<RetailPass & { qr: string }> };

function qrUrl(orderId: string, key: string, token: string) {
  const url = new URL(`/customer/orders/${encodeURIComponent(orderId)}`, window.location.origin);
  url.searchParams.set(key, token);
  return url.toString();
}

export function OrderPickupQrCodes({ orderId }: { orderId: string }) {
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
      const payload = await response.json() as { data?: { foodOrders?: FoodPass[]; eventPickups?: EventPass[]; retailPickups?: RetailPass[] } };
      if (!response.ok || !payload.data) throw new Error("pickup_passes_unavailable");
      const [foodOrders, eventPickups, retailPickups] = await Promise.all([
        Promise.all((payload.data.foodOrders ?? []).map(async (pass) => ({ ...pass, qr: await QRCode.toDataURL(qrUrl(orderId, "food_t", pass.foodToken), { width: 176, margin: 2, errorCorrectionLevel: "M" }) }))),
        Promise.all((payload.data.eventPickups ?? []).map(async (pass) => ({ ...pass, qr: await QRCode.toDataURL(qrUrl(orderId, "event_t", pass.eventToken), { width: 176, margin: 2, errorCorrectionLevel: "M" }) }))),
        Promise.all((payload.data.retailPickups ?? []).map(async (pass) => pass.retailToken
          ? ({ ...pass, qr: await QRCode.toDataURL(qrUrl(orderId, "retail_t", pass.retailToken), { width: 176, margin: 2, errorCorrectionLevel: "M" }) })
          : ({ ...pass, qr: "" }))),
      ]);
      if (requestId === requestRef.current && !controller.signal.aborted) {
        setData({ ownerKey, value: { foodOrders, eventPickups, retailPickups } });
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
  const hasPasses = currentData.foodOrders.length + currentData.eventPickups.length + currentData.retailPickups.length > 0;
  if (!hasPasses) return null;

  return <div className="space-y-6">
    <FoodOrderQrCodes orderId={orderId} passes={currentData.foodOrders} onRefresh={() => void refresh()} />
    <EventPickupQrCodes orderId={orderId} passes={currentData.eventPickups} />
    {currentData.retailPickups.length > 0 && <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="retail-pickup-qr-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
        <div><h2 id="retail-pickup-qr-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-primary">{t("ui.pickupPasses.retailTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("ui.pickupPasses.retailDescription")}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} />{t("ui.booking.refreshPass")}</Button>
      </div>
      {currentData.retailPickups.map((pass) => {
        const collectible = pass.status === "pending" && Boolean(pass.retailToken);
        const complete = pass.status === "collected" || pass.status === "legacy_completed";
        const tone = complete ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
          : collectible ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            : "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
        return <CustomerQrPassCard key={pass.orderItemId} title={pass.name} merchantLabel={t("ui.labels.providedBy", { vendor: pass.vendorName })} outletLabel={`${t("ui.labels.outlet")}: ${pass.outletName}`} qr={collectible && pass.qr
          ? <Image src={pass.qr} alt={t("ui.pickupPasses.retailQrAlt", { product: pass.name })} width={176} height={176} unoptimized className="aspect-square w-full rounded-lg bg-white object-contain" />
          : <div className="grid aspect-square w-full place-items-center rounded-lg bg-muted text-center text-xs text-muted-foreground">{t("ui.pickupPasses.noActiveQr")}</div>}>
          <p className="text-sm font-semibold text-foreground">{pass.variant ? `${pass.name} · ${pass.variant}` : pass.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.pickupPasses.quantity", { count: pass.quantity })}</p>
          <Badge variant="outline" role="status" className={`mt-3 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold leading-snug [&>svg]:size-4 ${tone}`}>
            {complete ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            <span>{t(`ui.pickupPasses.status.${pass.status}`)}</span>
          </Badge>
        </CustomerQrPassCard>;
      })}
    </section>}
  </div>;
}
