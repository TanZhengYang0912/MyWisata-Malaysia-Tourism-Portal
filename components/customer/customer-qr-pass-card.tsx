import type { ReactNode } from "react";

interface CustomerQrPassCardProps {
  title: string;
  merchantLabel?: string | null;
  outletLabel?: string | null;
  qr: ReactNode;
  children: ReactNode;
  mobileStacked?: boolean;
}

export function CustomerQrPassCard({ title, merchantLabel, outletLabel, qr, children, mobileStacked = false }: CustomerQrPassCardProps) {
  return (
    <article
      data-qr-pass-card="true"
      className={`grid ${mobileStacked ? "grid-cols-1 p-4 sm:grid-cols-[minmax(0,1fr)_11rem]" : "grid-cols-[minmax(0,1fr)_8rem] p-5 sm:grid-cols-[minmax(0,1fr)_11rem]"} items-start gap-4 border-b border-border last:border-b-0 sm:items-center sm:gap-6 sm:px-6 sm:py-6`}
    >
      <div data-qr-pass-details="true" className="min-w-0">
        <h3 className="break-words text-lg font-bold leading-tight text-foreground">{title}</h3>
        {merchantLabel && <p className="mt-1 text-xs text-muted-foreground">{merchantLabel}</p>}
        {outletLabel && <p className="mt-1 text-xs text-muted-foreground">{outletLabel}</p>}
        <div className="mt-3 min-w-0">{children}</div>
      </div>
      <div data-qr-pass-code="true" className={mobileStacked
        ? "mx-auto flex w-full min-w-0 max-w-60 items-center justify-center rounded-xl border border-border bg-card p-2.5 sm:mx-0 sm:w-44 sm:max-w-full sm:justify-self-end sm:p-2"
        : "flex w-32 min-w-0 max-w-full items-center justify-self-end rounded-xl border border-border bg-card p-2 sm:w-44"}>
        {qr}
      </div>
    </article>
  );
}
