import type { ReactNode } from "react";

interface CustomerQrPassCardProps {
  title: string;
  merchantLabel?: string | null;
  outletLabel?: string | null;
  qr: ReactNode;
  children: ReactNode;
}

export function CustomerQrPassCard({ title, merchantLabel, outletLabel, qr, children }: CustomerQrPassCardProps) {
  return (
    <article
      data-qr-pass-card="true"
      className="grid grid-cols-[minmax(0,1fr)_8rem] items-start gap-4 border-b border-border p-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-6 sm:px-6 sm:py-6"
    >
      <div data-qr-pass-details="true" className="min-w-0">
        <h3 className="break-words text-lg font-bold leading-tight text-foreground">{title}</h3>
        {merchantLabel && <p className="mt-1 text-xs text-muted-foreground">{merchantLabel}</p>}
        {outletLabel && <p className="mt-1 text-xs text-muted-foreground">{outletLabel}</p>}
        <div className="mt-3 min-w-0">{children}</div>
      </div>
      <div data-qr-pass-code="true" className="flex w-32 min-w-0 max-w-full items-center justify-self-end rounded-xl border border-border bg-card p-2 sm:w-44">
        {qr}
      </div>
    </article>
  );
}
