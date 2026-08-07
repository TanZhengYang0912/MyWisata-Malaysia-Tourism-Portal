"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildBookingQrPayload } from "@/lib/customer/booking-qr";

interface BookingQrCodeProps {
  bookingId: string;
  size?: number;
}

export function BookingQrCode({ bookingId, size = 144 }: BookingQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bookingId || !canvasRef.current) return;
    let active = true;
    setError(false);
    void QRCode.toCanvas(
      canvasRef.current,
      buildBookingQrPayload(bookingId, window.location.origin),
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
  }, [bookingId, size]);

  if (error) {
    return <div className="flex h-full min-h-24 w-full items-center justify-center rounded-xl bg-secondary px-3 text-center text-xs font-semibold text-destructive">QR unavailable</div>;
  }

  return <canvas ref={canvasRef} aria-label="Booking QR code" className="max-w-full rounded-xl bg-white" />;
}
