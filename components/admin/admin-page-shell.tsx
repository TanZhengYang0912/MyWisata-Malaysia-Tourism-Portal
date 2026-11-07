"use client";

import type { ReactNode } from "react";

type AdminPageShellProps = {
  children: ReactNode;
  className?: string;
};

type AdminPageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export type AdminMetric = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: string;
};

type AdminMetricGridProps = {
  items: AdminMetric[];
};

export function AdminPageShell({ children, className }: AdminPageShellProps) {
  return (
    <main className={`min-h-full bg-background px-4 py-5 sm:px-6 sm:py-6 xl:px-8 ${className ?? ""}`.trim()}>
      <div className="w-full space-y-5">{children}</div>
    </main>
  );
}

export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex min-w-0 flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 inline-flex max-w-full flex-wrap items-center gap-2 break-words text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</div>}
        <h1 className="break-words font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.03em] text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 min-w-0 [&>*]:max-w-full lg:ml-auto lg:w-fit lg:shrink-0">{actions}</div>}
    </header>
  );
}

export function AdminMetricGrid({ items }: AdminMetricGridProps) {
  if (items.length === 0) return null;

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item, index) => (
        <div key={`${String(item.label)}-${index}`} className="min-w-0 rounded-2xl border border-border bg-card px-3 py-3.5 sm:px-4">
          <p className="break-words text-xs font-semibold text-muted-foreground">{item.label}</p>
          <p className={`mt-1.5 break-words text-2xl font-bold tracking-[-0.04em] ${item.tone ?? "text-foreground"}`}>{item.value}</p>
          {item.detail && <p className="mt-0.5 break-words text-xs font-medium text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </section>
  );
}
