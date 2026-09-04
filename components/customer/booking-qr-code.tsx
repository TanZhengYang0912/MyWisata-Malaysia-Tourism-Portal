"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { buildBookingQrPayload } from "@/lib/customer/booking-qr";

interface BookingQrCodeProps {
  bookingId: string;
  size?: number;
  passToken?: string;
  policy?: "single_entry" | "multi_entry" | "group_entry";
  entryLimit?: number;
  entriesUsed?: number;
}

export function BookingQrCode({
  bookingId,
  size = 144,
  passToken,
  policy,
  entryLimit,
  entriesUsed,
}: BookingQrCodeProps) {
  const { t } = useTranslation("customer");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bookingId || !canvasRef.current) return;
    let active = true;
    setError(false);
    void QRCode.toCanvas(
      canvasRef.current,
      buildBookingQrPayload(bookingId, window.location.origin, passToken),
      {
        width: size,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#010066", light: "#ffffff" },
      },
    ).catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [bookingId, size, passToken]);

  if (error) {
    return (
      <div className="flex h-full min-h-24 w-full items-center justify-center rounded-xl bg-secondary px-3 text-center text-xs font-semibold text-destructive">
        {t("ui.booking.qrUnavailable")}
      </div>
    );
  }

  const remaining = typeof entryLimit === "number" && typeof entriesUsed === "number"
    ? Math.max(0, entryLimit - entriesUsed)
    : null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas ref={canvasRef} aria-label={t("ui.booking.qrCodeLabel")} className="max-w-full rounded-xl bg-white shadow-sm" />
      {remaining !== null && entryLimit !== undefined && entryLimit > 1 && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {policy === "multi_entry" ? "Multi-Entry: " : "Group Pass: "}
          {remaining} / {entryLimit} remaining
        </span>
      )}
    </div>
  );
}
