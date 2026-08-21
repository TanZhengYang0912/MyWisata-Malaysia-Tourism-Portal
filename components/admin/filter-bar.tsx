import type { ReactNode } from 'react';

export const adminFilterControlClassName =
  'h-10 shrink-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Shared presentation for Admin search and filter controls. */
export function AdminFilterBar({ children, className = '' }: Props) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-3">
        {children}
      </div>
    </section>
  );
}
