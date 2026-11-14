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
        {/* Quiet context line; icons passed by callers are hidden so titles carry no decoration. */}
        {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:hidden">{eyebrow}</div>}
        {/* Title scale follows the Events / Promote Event headings. */}
        <h1 className={`break-words text-3xl font-bold tracking-tight text-foreground sm:text-4xl ${titleClassName}`}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:justify-end [&>*]:w-full md:[&>*]:w-auto">{actions}</div>}
    </header>
  );
}
