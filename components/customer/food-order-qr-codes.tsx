"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, MapPin } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
        {passes.map((pass) => {
          const statusPresentation = pass.status === "fulfilled"
            ? { Icon: CheckCircle2, tone: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" }
            : pass.status === "checked_in"
              ? { Icon: MapPin, tone: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200" }
              : { Icon: Clock3, tone: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200" };

          return (
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
              <Badge
                variant="outline"
                role="status"
                className={`mt-3 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold leading-snug [&>svg]:size-4 ${statusPresentation.tone}`}
              >
                <statusPresentation.Icon aria-hidden="true" />
                <span>{t(`ui.booking.foodOrderStatus.${pass.status}`)}</span>
              </Badge>
              <ul className="mt-3 space-y-1 text-sm text-foreground">
                {pass.items.map((item, index) => <li key={item.name + index}>{item.quantity} × {item.name}{item.variant ? " · " + item.variant : ""}</li>)}
              </ul>
            </CustomerQrPassCard>
          );
        })}
      </div>
    </section>
  );
}
