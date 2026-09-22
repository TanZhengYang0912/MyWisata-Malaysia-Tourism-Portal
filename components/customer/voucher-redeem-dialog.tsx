"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Check, Copy, MapPin } from "lucide-react";

import CenteredDetailModal from "@/components/ui/centered-detail-modal";
import { VoucherBarcode } from "@/components/customer/voucher-barcode";
import { formatMYRNumber } from "@/lib/i18n/format";
import type { CustomerVoucher } from "@/lib/customer/voucher-claims";

interface VoucherRedeemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher: CustomerVoucher | null;
}

export function VoucherRedeemDialog({
  open,
  onOpenChange,
  voucher,
}: VoucherRedeemDialogProps) {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [storeTokenCopied, setStoreTokenCopied] = useState(false);
  const [codeType, setCodeType] = useState<"qr" | "barcode">("qr");

  const storeToken = voucher?.claim?.storeToken;

  useEffect(() => {
    if (!open || !storeToken || !canvasRef.current) return;

    QRCode.toCanvas(canvasRef.current, storeToken, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#010066", light: "#ffffff" },
    }).catch(() => {
      // silently handle canvas render error
    });
  }, [open, storeToken, codeType]);

  if (!open || !voucher) return null;

  async function copyCode() {
    if (!voucher?.code) return;
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  async function copyStoreToken() {
    if (!storeToken) return;
    try {
      await navigator.clipboard.writeText(storeToken);
      setStoreTokenCopied(true);
      setTimeout(() => setStoreTokenCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  const discountLabel =
    voucher.voucherType === "percent"
      ? tCustomer("ui.voucherHub.percentOff", { value: voucher.discountValue })
      : voucher.voucherType === "fixed"
        ? tCustomer("ui.voucherHub.fixedOff", { value: formatMYRNumber(voucher.discountValue) })
        : tCustomer("ui.voucherHub.filters.bogo");

  const expiryLabel = voucher.validUntil
    ? tCustomer("ui.voucherHub.ends", {
        date: new Date(voucher.validUntil).toLocaleDateString(i18n.resolvedLanguage ?? "en-MY", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      })
    : tCustomer("ui.voucherHub.noExpiry");

  return (
    <CenteredDetailModal
      eyebrow={tCustomer("ui.voucherHub.eyebrow")}
      title={voucher.vendorName}
      subtitle={voucher.outletName ? undefined : tCustomer("ui.voucherHub.showAtOutlet")}
      closeLabel={tCustomer("ui.voucherHub.barcodeModal.close")}
      onClose={() => onOpenChange(false)}
      className="rounded-3xl"
    >
      {voucher.outletName && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <MapPin size={13} className="text-primary" aria-hidden="true" /> {voucher.outletName}
        </p>
      )}
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {tCustomer("ui.voucherHub.barcodeModal.description")}
      </p>

        <div className="my-2 rounded-2xl bg-secondary/50 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {voucher.name}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-black text-primary">
            {discountLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{expiryLabel}</p>
        </div>

        {storeToken ? (
          <>
            {/* Format Selector: QR Code vs Barcode */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl bg-secondary/70 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCodeType("qr")}
                  className={`rounded-lg px-4 py-1.5 transition ${
                    codeType === "qr" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tCustomer("ui.voucherHub.barcodeModal.qrCode")}
                </button>
                <button
                  type="button"
                  onClick={() => setCodeType("barcode")}
                  className={`rounded-lg px-4 py-1.5 transition ${
                    codeType === "barcode" ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tCustomer("ui.voucherHub.barcodeModal.barcode")}
                </button>
              </div>
            </div>

            {/* Code Visual Display */}
            <div className="flex flex-col items-center justify-center py-2">
              {codeType === "qr" ? (
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                  <canvas ref={canvasRef} className="h-auto max-w-full" aria-label={tCustomer("ui.voucherHub.barcodeModal.redemptionQrCode")} />
                </div>
              ) : (
                <div className="w-full max-w-xs rounded-2xl border border-border bg-white p-3 shadow-sm">
                  <VoucherBarcode
                    value={storeToken}
                    text={voucher.code}
                    label={tCustomer("ui.voucherHub.barcodeModal.storeBarcode")}
                  />
                </div>
              )}
              <p className="mt-3 max-w-xs text-center text-xs text-muted-foreground">
                {tCustomer("ui.voucherHub.barcodeInstruction", "Present this code to the staff at checkout to scan and apply discount.")}
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-secondary/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                {tCustomer("ui.voucherHub.storeTokenManualHint")}
              </p>
              <button
                type="button"
                onClick={copyStoreToken}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-live="polite"
              >
                {storeTokenCopied ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-600">{tCustomer("ui.voucherHub.storeTokenCopied")}</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>{tCustomer("ui.voucherHub.copyStoreToken")}</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
            {tCustomer("ui.voucherHub.storeTokenUnavailable")}
          </p>
        )}

        {/* Manual Code & Copy */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {tCustomer("ui.voucherHub.voucherCode")}
            </p>
            <p className="mt-0.5 break-all select-all font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">
              {voucher.code}
            </p>
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-2 text-xs font-bold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-600" />
                <span className="text-emerald-600">{tCustomer("ui.voucherHub.copied")}</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>{tCustomer("ui.voucherHub.copyCode")}</span>
              </>
            )}
          </button>
        </div>
    </CenteredDetailModal>
  );
}
