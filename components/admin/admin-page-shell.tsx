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
    <main className={`min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8 ${className ?? ""}`.trim()}>
      <div className="w-full space-y-6">{children}</div>
    </main>
  );
}

export function AdminPageHeader({ eyebrow, title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        {eyebrow && <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</div>}
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-fit shrink-0 flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </header>
  );
}

export function AdminMetricGrid({ items }: AdminMetricGridProps) {
  if (items.length === 0) return null;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div key={`${String(item.label)}-${index}`} className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">{item.label}</p>
          <p className={`mt-4 text-3xl font-bold tracking-[-0.05em] ${item.tone ?? "text-foreground"}`}>{item.value}</p>
          {item.detail && <p className="mt-1 text-xs font-medium text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </section>
  );
}
