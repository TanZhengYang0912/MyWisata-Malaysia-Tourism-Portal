import type { ReactNode } from 'react';

export const adminFilterControlClassName =
  'h-10 max-w-full shrink-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Shared presentation for Admin search and filter controls. */
export function AdminFilterBar({ children, className = '' }: Props) {
  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-border bg-card p-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2.5 min-w-0 max-w-full">
        {children}
      </div>
    </section>
  );
}
