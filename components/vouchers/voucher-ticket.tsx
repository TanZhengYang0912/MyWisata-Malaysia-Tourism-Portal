"use client";

import { useState, type ReactNode } from "react";

import { Check, Copy, MapPin } from "lucide-react";

import { cn } from "@/components/utils";
import { VoucherBarcode } from "@/components/customer/voucher-barcode";

export type VoucherTicketOffer = {
  brandName: string;
  name: string;
  outletBadge?: string | null;
  code?: string | null;
  codeLabel?: string;
  codeCopyLabels: { copy: string; copied: string };
  barcodeValue?: string | null;
  barcodeLabel?: string;
  onBarcodeClick?: () => void;
  discountLabel: string;
  minSpendLabel: string | null;
  expiryLabel: string;
  /** Stub date: shown when there is no code to hand over. `endsAt` null means the voucher never expires. */
  expiry?: { label: string; endsAt: string | null; noEndLabel: string; locale: string };
  availabilityLabel: string;
  scopeLabel: string;
  scopeDetail?: ReactNode;
  /** Full-width strip under the ticket, e.g. the products a voucher covers. */
  strip?: ReactNode;
  locationLabel?: string | null;
  identityLabel?: ReactNode;
  status?: ReactNode;
  image?: { src: string; alt: string } | null;
  images?: Array<{ src: string; alt: string }>;
  fallback?: { logoUrl: string | null; logoAlt: string; initials: string } | null;
};

export interface VoucherTicketProps {
  offer: VoucherTicketOffer;
  children: ReactNode;
  className?: string;
}

/** Month, day and year of the last valid day, in Malaysia time (vouchers end on Malaysian dates). */
function expiryParts(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "short", day: "numeric" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return { month: part("month"), day: part("day"), year: part("year") };
}

function VoucherCodeDisplay({ code, label, copyLabels }: { code: string; label?: string; copyLabels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          title={copied ? copyLabels.copied : copyLabels.copy}
          aria-label={copied ? copyLabels.copied : copyLabels.copy}
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-600" aria-hidden="true" />
              <span className="text-emerald-600">{copyLabels.copied}</span>
            </>
          ) : (
            <>
              <Copy size={11} aria-hidden="true" />
              <span>{copyLabels.copy}</span>
            </>
          )}
        </button>
      </div>
      <p className="mt-1 break-all select-all font-[family-name:var(--font-mono)] text-sm font-bold tracking-wide text-foreground">
        {code}
      </p>
    </div>
  );
}

/**
 * One voucher as an admission ticket: a plain photo, the offer (the discount is the
 * protagonist), then a tear-off stub. The stub carries what the holder hands over:
 * the code and barcode once claimed, otherwise the last valid day.
 */
export function VoucherTicket({ offer, children, className }: VoucherTicketProps) {
  const hasHandover = Boolean(offer.code || offer.barcodeValue);
  const ends = !hasHandover && offer.expiry?.endsAt ? expiryParts(offer.expiry.endsAt, offer.expiry.locale) : null;
  // The meta line repeats the expiry only when the stub is busy with a code.
  const meta = [offer.minSpendLabel, offer.scopeLabel, hasHandover || !offer.expiry ? offer.expiryLabel : null].filter(Boolean);

  return (
    <article data-voucher-ticket className={cn("overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_12px_32px_rgba(1,0,102,0.06)]", className)}>
      <div className="flex max-sm:flex-col">
        {/* Plain photo: no overlay, no text on the image. */}
        <div className="relative h-40 shrink-0 overflow-hidden bg-secondary sm:h-auto sm:min-h-52 sm:w-[34%] sm:max-w-72">
          {offer.images !== undefined ? (
            offer.images.length > 0 ? (
              <div className={`absolute inset-0 grid gap-px ${offer.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {offer.images.slice(0, 4).map((image, index, images) => (
                  <div key={`${image.src}-${index}`} className={`relative min-h-0 overflow-hidden ${images.length === 3 && index === 2 ? "col-span-2" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt={image.alt} width={640} height={480} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null
          ) : offer.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.image.src} alt={offer.image.alt} width={640} height={480} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : offer.fallback?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.fallback.logoUrl} alt={offer.fallback.logoAlt} width={640} height={480} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-wide text-primary/40">
                {offer.fallback?.initials ?? offer.brandName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 p-5 sm:px-7 sm:py-6">
          {/* Status line: who vouches for it and where it applies. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
            {offer.identityLabel && (
              <span className="inline-flex items-center gap-1.5 text-primary">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                {offer.identityLabel}
              </span>
            )}
            {offer.outletBadge && <span className="text-muted-foreground">{offer.outletBadge}</span>}
            {offer.status}
          </div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none tracking-tight text-primary sm:text-5xl">{offer.discountLabel}</p>
          <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-foreground sm:text-xl">{offer.name}</h2>
          {offer.locationLabel && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin size={15} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{offer.locationLabel}</span>
            </p>
          )}
          {offer.scopeDetail}
          {meta.length > 0 && <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>}
        </div>

        {/* Tear-off stub: perforation and notches on the dashed edge; the action lives here, like a ticket's tear-off. */}
        <div className="relative flex shrink-0 flex-col gap-4 border-t border-dashed border-border bg-secondary/40 px-5 py-4 sm:w-56 sm:justify-center sm:border-l sm:border-t-0 sm:px-6 sm:py-6">
          <span aria-hidden="true" className="absolute -left-3 -top-3 hidden h-6 w-6 rounded-full border border-border bg-background sm:block" />
          <span aria-hidden="true" className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full border border-border bg-background sm:block" />
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:gap-3 sm:text-center">
            {hasHandover ? (
              <div className="flex w-full flex-col gap-3 sm:text-left">
                {offer.code && <VoucherCodeDisplay code={offer.code} label={offer.codeLabel} copyLabels={offer.codeCopyLabels} />}
                {offer.barcodeValue && (
                  <div className="max-sm:hidden">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{offer.barcodeLabel}</p>
                    <div
                      onClick={offer.onBarcodeClick}
                      className={cn(offer.onBarcodeClick && "cursor-pointer transition hover:opacity-90")}
                      role={offer.onBarcodeClick ? "button" : undefined}
                      tabIndex={offer.onBarcodeClick ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (offer.onBarcodeClick && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          offer.onBarcodeClick();
                        }
                      }}
                    >
                      <VoucherBarcode value={offer.barcodeValue} text={offer.code ?? undefined} label={offer.barcodeLabel ?? "Voucher barcode"} />
                    </div>
                  </div>
                )}
              </div>
            ) : offer.expiry ? (
              ends ? (
                <p className="flex items-baseline gap-2 text-foreground sm:flex-col sm:items-center sm:gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em]">{offer.expiry.label} {ends.month}</span>
                  <span className="font-[family-name:var(--font-display)] text-3xl font-bold leading-none tabular-nums sm:text-5xl">{ends.day}</span>
                  <span className="text-xs font-bold tabular-nums">{ends.year}</span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-foreground">{offer.expiry.noEndLabel}</p>
              )
            ) : null}
            <p className="shrink-0 text-xs font-semibold text-primary">{offer.availabilityLabel}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 text-center empty:hidden">{children}</div>
        </div>
      </div>

      {offer.strip && <div className="border-t border-border">{offer.strip}</div>}
    </article>
  );
}
