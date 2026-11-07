import type { ReactNode } from 'react';

interface VendorPageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
}

/** Shared responsive heading for Vendor Portal routes. */
export function VendorPageHeader({
  title,
  eyebrow,
  description,
  actions,
  className = '',
  titleClassName = '',
}: VendorPageHeaderProps) {
  return (
    <header className={`flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</div>}
        <h1 className={`break-words text-2xl font-bold tracking-tight text-gray-950 dark:text-foreground sm:text-3xl ${titleClassName}`}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:justify-end [&>*]:w-full md:[&>*]:w-auto">{actions}</div>}
    </header>
  );
}
