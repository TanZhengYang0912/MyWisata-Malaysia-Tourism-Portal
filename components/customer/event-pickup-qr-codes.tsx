"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
import { CustomerQrPassSection } from "@/components/customer/customer-qr-pass-section";
import { PickupCodeCopy } from "@/components/customer/pickup-code-copy";
import { EnlargeableQrCode } from "@/components/customer/enlargeable-qr-code";
import { getCustomerPassQrOptions } from "@/lib/customer/pass-qr-options";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatEventDate } from "@/lib/promotion-campaigns/locations";

type EventPickupPass = {
  vendorName: string;
  pickupDate: string;
  /** "Location · 10:00–11:00" snapshots, one per pickup window in this group. */
  pickupLabels: string[];
  status: "pending" | "collected";
  items: { name: string; quantity: number }[];
  eventToken: string;
  eventCode: string | null;
};
type EventPickupPassDisplay = EventPickupPass & { qr: string };

/** QR codes for collecting event reservations — one per stall and pickup date, valid on that date only. */
export function EventPickupQrCodes({ orderId, passes: controlledPasses, onRefresh, parentRefreshing = false }: { orderId: string; passes?: EventPickupPassDisplay[]; onRefresh?: () => void; parentRefreshing?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [passes, setPasses] = useState<EventPickupPassDisplay[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/customer/orders/" + encodeURIComponent(orderId) + "/qr-passes", { cache: "no-store" });
      const payload = await response.json() as { data?: { eventPickups?: EventPickupPass[] } };
      if (!response.ok) {
        setPasses([]);
        return;
      }
      setPasses(await Promise.all((payload.data?.eventPickups ?? []).map(async (pass) => pass.status === "pending" && pass.eventCode
        ? { ...pass, qr: await QRCode.toDataURL(pass.eventCode.replace(/-/g, ""), getCustomerPassQrOptions(512)) }
        : { ...pass, qr: "" })));
    } catch {
      setPasses([]);
    }
  }, [orderId]);

  useEffect(() => {
    if (controlledPasses !== undefined) return;
    const load = () => { void refresh(); };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [controlledPasses, refresh]);

  const visiblePasses = controlledPasses ?? passes;
  if (visiblePasses.length === 0) return null;

  return (
    <CustomerQrPassSection
      headingId="event-pickup-qr-heading"
      title={t("ui.eventPickup.title")}
      action={<Button type="button" variant="outline" size="sm" onClick={() => onRefresh ? onRefresh() : void refresh()} disabled={onRefresh ? parentRefreshing : false}>
        <RefreshCw size={14} aria-hidden="true" />{t("ui.pickupPasses.refresh")}
      </Button>}
    >
      {visiblePasses.map((pass) => {
        const collected = pass.status === "collected";
        const collectible = pass.status === "pending" && Boolean(pass.eventCode);
        const date = formatEventDate(pass.pickupDate, locale);
        return (
          <CustomerQrPassCard
            key={pass.eventToken}
            title={pass.pickupLabels.join(", ")}
            mobileStacked
            qr={
              collectible && pass.qr
                ? <EnlargeableQrCode src={pass.qr} alt={t("ui.eventPickup.qrAlt", { date })} />
                : <div className="grid aspect-square w-full place-items-center rounded-lg bg-muted text-center text-xs text-muted-foreground">{t("ui.pickupPasses.noActiveQr")}</div>
            }
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary"><CalendarDays size={14} aria-hidden="true" />{date}</p>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              {pass.items.map((item, index) => <li key={item.name + index}>{item.quantity} × {item.name}</li>)}
            </ul>
            {collectible && pass.eventCode && <PickupCodeCopy code={pass.eventCode} />}
            <Badge
              variant="outline"
              role="status"
              className={`mt-5 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold [&>svg]:size-4 ${collected
                ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"}`}
            >
              {collected ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
              <span>{t(`ui.eventPickup.status.${pass.status}`)}</span>
            </Badge>
          </CustomerQrPassCard>
        );
      })}
    </CustomerQrPassSection>
  );
}
