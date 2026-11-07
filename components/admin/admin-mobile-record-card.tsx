import type { ReactNode } from "react";
import { cn } from "@/components/utils";

interface AdminMobileRecordCardProps {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AdminMobileRecordCard({
  header,
  children,
  footer,
  className,
}: AdminMobileRecordCardProps) {
  return (
    <article
      data-admin-mobile-record-card
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <header
        data-admin-mobile-record-card-header
        className="flex min-w-0 items-start justify-between gap-3"
      >
        {header}
      </header>
      <div data-admin-mobile-record-card-content className="mt-3 min-w-0 space-y-3">
        {children}
      </div>
      {footer ? (
        <footer
          data-admin-mobile-record-card-footer
          className="mt-3 border-t border-border pt-3"
        >
          {footer}
        </footer>
      ) : null}
    </article>
  );
}
