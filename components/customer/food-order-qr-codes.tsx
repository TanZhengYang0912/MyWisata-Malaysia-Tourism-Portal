"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, MapPin, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
import { CustomerQrPassSection } from "@/components/customer/customer-qr-pass-section";
import { PickupCodeCopy } from "@/components/customer/pickup-code-copy";
import { EnlargeableQrCode } from "@/components/customer/enlargeable-qr-code";
import { getCustomerPassQrOptions } from "@/lib/customer/pass-qr-options";

type FoodOrderPass = {
  outletId: string;
  outletName: string;
  vendorName: string;
  mode: "dine_in" | "takeaway";
  status: "pending" | "checked_in" | "fulfilled";
  items: { name: string; variant: string | null; quantity: number }[];
  foodToken: string;
  foodCode: string | null;
};
type FoodOrderPassDisplay = FoodOrderPass & { qr: string };

export function FoodOrderQrCodes({ orderId, passes: controlledPasses, onRefresh, parentRefreshing = false }: { orderId: string; passes?: FoodOrderPassDisplay[]; onRefresh?: () => void; parentRefreshing?: boolean }) {
  const { t } = useTranslation("customer");
  const [passes, setPasses] = useState<FoodOrderPassDisplay[]>([]);
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
        if (pass.status !== "pending" || !pass.foodCode) return { ...pass, qr: "" };
        return { ...pass, qr: await QRCode.toDataURL(pass.foodCode.replace(/-/g, ""), getCustomerPassQrOptions(512)) };
      }));
      setPasses(next);
    } catch {
      setPasses([]);
    } finally {
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (controlledPasses !== undefined) return;
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
  }, [controlledPasses, refresh]);

  const visiblePasses = controlledPasses ?? passes;
  if (visiblePasses.length === 0) return null;

  return (
    <CustomerQrPassSection
      headingId="food-order-qr-heading"
      title={t("ui.booking.foodOrderQrTitle")}
      action={<Button type="button" variant="outline" size="sm" onClick={() => onRefresh ? onRefresh() : void refresh()} disabled={onRefresh ? parentRefreshing : refreshing}>
        <RefreshCw size={14} aria-hidden="true" />{t("ui.pickupPasses.refresh")}
      </Button>}
    >
      <div>
        {visiblePasses.map((pass) => {
          const statusPresentation = pass.status === "fulfilled"
            ? { Icon: CheckCircle2, tone: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" }
            : pass.status === "checked_in"
              ? { Icon: MapPin, tone: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200" }
              : { Icon: Clock3, tone: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200" };

          return (
            <CustomerQrPassCard
              key={pass.outletId}
              title={pass.outletName}
              mobileStacked
              qr={pass.status === "pending" && pass.foodCode && pass.qr
                ? <EnlargeableQrCode src={pass.qr} alt={t("ui.booking.foodOrderQrAlt", { outlet: pass.outletName })} />
                : <div className="grid aspect-square w-full place-items-center rounded-lg bg-muted text-center text-xs text-muted-foreground">{t("ui.pickupPasses.noActiveQr")}</div>}
            >
              <p className="mt-1 text-sm font-semibold text-primary">{pass.mode === "dine_in" ? t("ui.checkout.foodModes.dine_in") : t("ui.checkout.foodModes.takeaway")}</p>
              <ul className="mt-3 space-y-1 text-sm text-foreground">
                {pass.items.map((item, index) => <li key={item.name + index}>{item.quantity} × {item.name}{item.variant ? " · " + item.variant : ""}</li>)}
              </ul>
              {pass.status === "pending" && pass.foodCode && <PickupCodeCopy code={pass.foodCode} />}
              <Badge
                variant="outline"
                role="status"
                className={`mt-5 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold leading-snug [&>svg]:size-4 ${statusPresentation.tone}`}
              >
                <statusPresentation.Icon aria-hidden="true" />
                <span>{t(`ui.booking.foodOrderStatus.${pass.status}`)}</span>
              </Badge>
            </CustomerQrPassCard>
          );
        })}
      </div>
    </CustomerQrPassSection>
  );
}
