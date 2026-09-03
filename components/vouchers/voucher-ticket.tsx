import type { ReactNode } from "react";

import { MapPin, Ticket, WalletCards } from "lucide-react";

import { cn } from "@/components/utils";

export type VoucherTicketOffer = {
  brandName: string;
  name: string;
  code?: string | null;
  codeLabel?: string;
  discountLabel: string;
  minSpendLabel: string | null;
  expiryLabel: string;
  availabilityLabel: string;
  scopeLabel: string;
  scopeDetail?: ReactNode;
  locationLabel?: string | null;
  identityLabel?: ReactNode;
  status?: ReactNode;
  image?: { src: string; alt: string } | null;
  fallback?: { logoUrl: string | null; logoAlt: string; initials: string } | null;
};

export interface VoucherTicketProps {
  offer: VoucherTicketOffer;
  children: ReactNode;
  className?: string;
}

export function VoucherTicket({ offer, children, className }: VoucherTicketProps) {
  return (
    <article data-voucher-ticket className={cn("group relative flex overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_12px_32px_rgba(1,0,102,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(1,0,102,0.14)] max-sm:flex-col", className)}>
      <div className="relative flex min-h-48 shrink-0 overflow-hidden bg-gradient-to-br from-primary via-[#15158a] to-[#31537b] text-white sm:w-[34%] sm:max-w-72">
        {offer.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.image.src} alt={offer.image.alt} width={640} height={480} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : offer.fallback?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.fallback.logoUrl} alt={offer.fallback.logoAlt} width={112} height={112} loading="lazy" className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white/95 object-contain p-3 shadow-xl" />
        ) : (
          <span className="absolute left-1/2 top-1/2 text-5xl font-black tracking-tight -translate-x-1/2 -translate-y-1/2">{offer.fallback?.initials ?? offer.brandName.slice(0, 2).toUpperCase()}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#01003f]/90 via-[#01003f]/10 to-[#01003f]/15" />
        <div className="relative flex w-full flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            {offer.identityLabel ? <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#010066]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] backdrop-blur-sm">{offer.identityLabel}</span> : <span />}
            {offer.status}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{offer.brandName}</p>
            {offer.locationLabel && <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-white/80"><MapPin size={13} aria-hidden="true" /> {offer.locationLabel}</p>}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{offer.scopeLabel}</p>
          <h2 className="mt-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">{offer.name}</h2>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-primary sm:text-4xl">{offer.discountLabel}</p>
          {offer.minSpendLabel && <p className="mt-2 text-sm font-semibold text-muted-foreground">{offer.minSpendLabel}</p>}
          {offer.scopeDetail && <div className="mt-4">{offer.scopeDetail}</div>}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-5 text-xs text-muted-foreground">
          <Ticket size={14} aria-hidden="true" className="shrink-0 text-primary" />
          <span className="truncate">{offer.expiryLabel}</span>
        </div>
      </div>

      <div className="relative flex shrink-0 flex-col justify-between border-t border-dashed border-border bg-secondary/40 px-5 py-5 sm:w-52 sm:border-l sm:border-t-0 sm:px-6">
        <span aria-hidden="true" className="absolute -left-3 -top-3 hidden h-6 w-6 rounded-full bg-background sm:block" />
        <span aria-hidden="true" className="absolute -bottom-3 -left-3 hidden h-6 w-6 rounded-full bg-background sm:block" />
        <div>
          {offer.code && <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{offer.codeLabel}</p><p className="mt-1 truncate font-[family-name:var(--font-mono)] text-sm font-bold tracking-wide text-foreground">{offer.code}</p></div>}
          <p className="text-xs font-semibold text-primary">{offer.availabilityLabel}</p>
        </div>
        <div className="mt-5 flex min-h-10 flex-col justify-end gap-2"><div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><WalletCards size={13} aria-hidden="true" /> <span>{offer.scopeLabel}</span></div>{children}</div>
      </div>
    </article>
  );
}
