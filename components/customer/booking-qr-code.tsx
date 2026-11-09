"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Expand } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildTicketPassQrPayload } from "@/lib/customer/booking-qr";
import { getCustomerPassQrOptions } from "@/lib/customer/pass-qr-options";
import { ticketProgress } from "@/lib/customer/ticket-progress";

interface BookingQrCodeProps {
  bookingId: string;
  orderId?: string;
  size?: number;
  passToken?: string;
  policy?: "single_entry" | "multi_entry" | "group_entry";
  entryLimit?: number;
  entriesUsed?: number;
  validUntil?: string;
  qrPayload?: string;
  refreshManagedByParent?: boolean;
  className?: string;
}

export function BookingQrCode({
  bookingId,
  orderId,
  size = 144,
  passToken,
  policy,
  entryLimit,
  entriesUsed,
  validUntil,
  qrPayload,
  refreshManagedByParent = false,
  className,
}: BookingQrCodeProps) {
  const { t } = useTranslation("customer");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  const [refreshedPass, setRefreshedPass] = useState<{
    bookingId: string;
    sourceToken?: string;
    sourceEntriesUsed?: number;
    sourceValidUntil?: string;
    token: string;
    ticketCode: string | null;
    entriesUsed: number;
    validUntil: string | undefined;
  }>();
  const [refreshing, setRefreshing] = useState(Boolean(orderId && !refreshManagedByParent && !qrPayload));
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [enlargedQr, setEnlargedQr] = useState<{ payload: string; dataUrl: string }>();
  const [enlargedQrError, setEnlargedQrError] = useState<string>();
  const currentRefreshedPass = refreshedPass?.bookingId === bookingId
    && refreshedPass.sourceToken === passToken
    && refreshedPass.sourceEntriesUsed === entriesUsed
    && refreshedPass.sourceValidUntil === validUntil
    ? refreshedPass
    : undefined;
  const liveToken = currentRefreshedPass?.token ?? passToken;
  const liveEntriesUsed = currentRefreshedPass?.entriesUsed ?? entriesUsed;
  const liveValidUntil = currentRefreshedPass?.validUntil ?? validUntil;
  const qrOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  const currentQrPayload = qrPayload ?? buildTicketPassQrPayload({
    bookingId,
    orderId,
    ticketCode: currentRefreshedPass?.ticketCode,
    passToken: liveToken,
    origin: qrOrigin,
  });

  const refreshPass = useCallback(async () => {
    if (!orderId || refreshManagedByParent) return;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/customer/orders/${encodeURIComponent(orderId)}/qr-passes`, { cache: "no-store" });
      const payload = await response.json() as { data?: { tickets?: Array<{ bookingId: string; passToken: string; ticketCode: string | null; entriesUsed: number; validUntil: string | null }> } };
      const ticket = response.ok ? payload.data?.tickets?.find((item) => item.bookingId === bookingId) : undefined;
      if (!ticket) return;
      setRefreshedPass({
        bookingId,
        sourceToken: passToken,
        sourceEntriesUsed: entriesUsed,
        sourceValidUntil: validUntil,
        token: ticket.passToken,
        ticketCode: ticket.ticketCode,
        entriesUsed: ticket.entriesUsed,
        validUntil: ticket.validUntil ?? undefined,
      });
    } catch {
      // Keep the server-rendered pass usable while the refresh endpoint is unavailable.
    } finally {
      setRefreshing(false);
    }
  }, [bookingId, entriesUsed, orderId, passToken, refreshManagedByParent, validUntil]);

  useEffect(() => {
    if (!orderId || refreshManagedByParent) return;
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await refreshPass();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [entriesUsed, orderId, passToken, refreshManagedByParent, refreshPass, validUntil]);

  useEffect(() => {
    if (!bookingId || !canvasRef.current || !currentQrPayload) return;
    const canvas = canvasRef.current;
    let active = true;
    setError(false);
    void QRCode.toCanvas(
      canvas,
      currentQrPayload,
      getCustomerPassQrOptions(size),
    ).catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [bookingId, currentQrPayload, size]);

  useEffect(() => {
    if (!qrDialogOpen || !bookingId || !currentQrPayload) return;
    let active = true;
    void QRCode.toDataURL(
      currentQrPayload,
      getCustomerPassQrOptions(320),
    ).then((dataUrl) => {
      if (active) setEnlargedQr({ payload: currentQrPayload, dataUrl });
    }).catch(() => {
      if (active) setEnlargedQrError(currentQrPayload);
    });
    return () => {
      active = false;
    };
  }, [bookingId, currentQrPayload, qrDialogOpen]);

  if (error) {
    return (
      <div className="flex h-full min-h-24 w-full items-center justify-center rounded-xl bg-secondary px-3 text-center text-xs font-semibold text-destructive">
        {t("ui.booking.qrUnavailable")}
      </div>
    );
  }

  const progress = typeof policy === "string" && typeof entryLimit === "number" && typeof liveEntriesUsed === "number"
    ? ticketProgress(policy, entryLimit, liveEntriesUsed)
    : null;
  const entryUnitLabel = progress?.unit === "entry"
    ? t("ui.booking.entryUnits.entry")
    : progress?.unit === "visits"
    ? t("ui.booking.entryUnits.visits")
    : t("ui.booking.entryUnits.guests");
  const currentEnlargedQr = currentQrPayload && enlargedQr?.payload === currentQrPayload ? enlargedQr.dataUrl : undefined;
  const currentEnlargedQrError = Boolean(currentQrPayload && enlargedQrError === currentQrPayload);

  return (
    <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
      <div className={`flex min-w-0 flex-col items-center gap-1.5 ${className ?? ""}`}>
        {currentQrPayload ? (
          <button
            type="button"
            aria-label={t("ui.booking.qrEnlargeAction")}
            aria-haspopup="dialog"
            onClick={() => {
              setEnlargedQr(undefined);
              setEnlargedQrError(undefined);
              setQrDialogOpen(true);
            }}
            className="group flex max-w-full flex-col items-center gap-1 rounded-lg p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <canvas ref={canvasRef} aria-hidden="true" className="max-w-full rounded-xl bg-white shadow-sm" />
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-primary transition-colors group-hover:text-primary/75">
              <Expand size={11} aria-hidden="true" />
              {t("ui.booking.qrEnlargeAction")}
            </span>
          </button>
        ) : (
          <span className="text-center text-[10px] text-muted-foreground">
            {refreshing ? t("ui.booking.qrPreparing") : t("ui.booking.qrUnavailable")}
          </span>
        )}
        {progress && (
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {t("ui.booking.entryProgress", { used: progress.used, total: progress.total, unit: entryUnitLabel })}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t("ui.booking.entriesRemaining", { count: progress.remaining })}
            </span>
            {policy === "multi_entry" && liveValidUntil && (
              <span className="text-[10px] text-muted-foreground">
                {t("ui.booking.passExpires", { date: new Date(liveValidUntil).toLocaleDateString() })}
              </span>
            )}
          </div>
        )}
        {orderId && !refreshManagedByParent && (
          <button type="button" onClick={() => void refreshPass()} disabled={refreshing} className="text-[10px] font-medium text-primary underline disabled:opacity-50">
            {t("ui.booking.refreshPass")}
          </button>
        )}
      </div>
      <DialogContent className="max-w-sm rounded-3xl p-6 sm:!max-w-sm">
        <DialogHeader className="pr-8 text-center sm:text-center">
          <DialogTitle>{t("ui.booking.qrCodeLabel")}</DialogTitle>
          <DialogDescription>{t("ui.booking.qrEnlargeDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-72 flex-col items-center justify-center gap-4">
          {currentEnlargedQr
            ? <Image unoptimized src={currentEnlargedQr} width={320} height={320} alt={t("ui.booking.qrCodeLabel")} className="h-auto w-full max-w-80 rounded-2xl bg-white p-2 shadow-sm" />
            : currentEnlargedQrError
            ? <p role="status" className="text-sm text-destructive">{t("ui.booking.qrUnavailable")}</p>
            : <span role="status" className="text-sm text-muted-foreground">{t("ui.booking.qrCodeLabel")}</span>}
          {progress && <div className="flex flex-col items-center gap-1 text-center">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {t("ui.booking.entryProgress", { used: progress.used, total: progress.total, unit: entryUnitLabel })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("ui.booking.entriesRemaining", { count: progress.remaining })}
            </span>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
