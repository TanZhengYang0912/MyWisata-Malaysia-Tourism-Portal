import type { ReactNode } from "react";

interface CustomerQrPassSectionProps {
  headingId: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function CustomerQrPassSection({ headingId, title, action, children }: CustomerQrPassSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <h2 id={headingId} className="text-xs font-bold uppercase tracking-[0.12em] text-primary sm:text-sm sm:tracking-[0.14em]">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
