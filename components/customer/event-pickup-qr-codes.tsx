"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { CustomerQrPassCard } from "@/components/customer/customer-qr-pass-card";
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
};
type EventPickupPassDisplay = EventPickupPass & { qr: string };

/** QR codes for collecting event reservations — one per stall and pickup date, valid on that date only. */
export function EventPickupQrCodes({ orderId, passes: controlledPasses }: { orderId: string; passes?: EventPickupPassDisplay[] }) {
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
      setPasses(await Promise.all((payload.data?.eventPickups ?? []).map(async (pass) => {
        const url = new URL("/customer/orders/" + encodeURIComponent(orderId), window.location.origin);
        url.searchParams.set("event_t", pass.eventToken);
        return { ...pass, qr: await QRCode.toDataURL(url.toString(), { width: 144, margin: 2, errorCorrectionLevel: "M" }) };
      })));
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
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="event-pickup-qr-heading">
      <div className="border-b border-border bg-secondary/40 px-5 py-4 sm:px-6">
        <h2 id="event-pickup-qr-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-primary">{t("ui.eventPickup.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("ui.eventPickup.description")}</p>
      </div>
      {visiblePasses.map((pass) => {
        const collected = pass.status === "collected";
        const date = formatEventDate(pass.pickupDate, locale);
        return (
          <CustomerQrPassCard
            key={pass.eventToken}
            title={pass.pickupLabels.join(", ")}
            merchantLabel={t("ui.labels.providedBy", { vendor: pass.vendorName })}
            qr={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pass.qr} alt={t("ui.eventPickup.qrAlt", { date })} className="aspect-square w-full rounded-lg bg-white object-contain" />
            }
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary"><CalendarDays size={14} aria-hidden="true" />{date}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("ui.eventPickup.validOn", { date })}</p>
            <Badge
              variant="outline"
              role="status"
              className={`mt-3 max-w-full justify-start gap-2 whitespace-normal rounded-xl px-3 py-2 text-left text-sm font-bold [&>svg]:size-4 ${collected
                ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"}`}
            >
              {collected ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
              <span>{t(`ui.eventPickup.status.${pass.status}`)}</span>
            </Badge>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              {pass.items.map((item, index) => <li key={item.name + index}>{item.quantity} × {item.name}</li>)}
            </ul>
          </CustomerQrPassCard>
        );
      })}
    </section>
  );
}
