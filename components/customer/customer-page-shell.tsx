import type { ReactNode } from "react";
import { cn } from "@/components/utils";

const CUSTOMER_PAGE_SHELL_CLASS =
  "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8";

const CUSTOMER_PAGE_TITLE_CLASS =
  "mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10";

const CUSTOMER_PANEL_CLASS =
  "rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6";

export function CustomerPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CUSTOMER_PAGE_SHELL_CLASS, className)}>{children}</div>;
}

type CustomerPageHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function CustomerPageTitle(props: CustomerPageHeaderProps) {
  return (
    <div className={CUSTOMER_PAGE_TITLE_CLASS}>
      <CustomerPageHeader {...props} />
    </div>
  );
}

export function CustomerPageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}: CustomerPageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          {icon}
          <span>{eyebrow}</span>
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CustomerPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(CUSTOMER_PANEL_CLASS, className)}>{children}</div>;
}
