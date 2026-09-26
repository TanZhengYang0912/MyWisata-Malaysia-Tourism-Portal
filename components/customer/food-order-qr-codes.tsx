"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";

type FoodOrderPass = {
  outletId: string;
  outletName: string;
  vendorName: string;
  mode: "dine_in" | "takeaway";
  status: "pending" | "checked_in" | "fulfilled";
  items: { name: string; variant: string | null; quantity: number }[];
  foodToken: string;
};

export function FoodOrderQrCodes({ orderId }: { orderId: string }) {
  const { t } = useTranslation("customer");
  const [passes, setPasses] = useState<Array<FoodOrderPass & { qr: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/customer/orders/" + encodeURIComponent(orderId) + "/qr-passes", { cache: "no-store" });
      const payload = await response.json() as { data?: { foodOrders?: FoodOrderPass[] } };
      if (!response.ok) {
        setPasses([]);
        return;
      }
      const next = await Promise.all((payload.data?.foodOrders ?? []).map(async (pass) => {
        const url = new URL("/customer/orders/" + encodeURIComponent(orderId), window.location.origin);
        url.searchParams.set("food_t", pass.foodToken);
        return { ...pass, qr: await QRCode.toDataURL(url.toString(), { width: 144, margin: 2, errorCorrectionLevel: "M" }) };
      }));
      setPasses(next);
    } catch {
      setPasses([]);
    } finally {
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const load = async () => { if (active) await refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  if (passes.length === 0) return null;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="food-order-qr-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
        <div>
          <h2 id="food-order-qr-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-primary">{t("ui.booking.foodOrderQrTitle")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.booking.foodOrderQrDescription")}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="text-xs font-semibold text-primary underline disabled:opacity-50">
          {t("ui.booking.refreshPass")}
        </button>
      </div>
      <div>
        {passes.map((pass) => (
          <CustomerQrPassCard
            key={pass.outletId}
            title={pass.outletName}
            merchantLabel={t("ui.labels.providedBy", { vendor: pass.vendorName })}
            qr={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pass.qr} alt={t("ui.booking.foodOrderQrAlt", { outlet: pass.outletName })} className="aspect-square w-full rounded-lg bg-white object-contain" />
            }
          >
            <p className="mt-1 text-sm font-semibold text-primary">{pass.mode === "dine_in" ? t("ui.checkout.foodModes.dine_in") : t("ui.checkout.foodModes.takeaway")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(pass.mode === "takeaway" ? "ui.booking.takeawayScanHint" : "ui.booking.dineInScanHint")}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{pass.status === "fulfilled" ? t("ui.booking.foodOrderStatus.fulfilled") : pass.status === "checked_in" ? t("ui.booking.foodOrderStatus.checked_in") : t("ui.booking.foodOrderStatus.pending")}</p>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              {pass.items.map((item, index) => <li key={item.name + index}>{item.quantity} × {item.name}{item.variant ? " · " + item.variant : ""}</li>)}
            </ul>
          </CustomerQrPassCard>
        ))}
      </div>
    </section>
  );
}
