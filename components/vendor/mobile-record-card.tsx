import type { ReactNode } from "react";
import { cn } from "@/components/utils";

interface VendorMobileRecordCardProps {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function VendorMobileRecordCard({
  header,
  children,
  footer,
  className,
}: VendorMobileRecordCardProps) {
  return (
    <article
      data-mobile-record-card
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-3 text-card-foreground",
        className,
      )}
    >
      <header
        data-mobile-record-card-header
        className="flex min-w-0 items-start justify-between gap-3"
      >
        {header}
      </header>
      <div data-mobile-record-card-content className="mt-3 space-y-3">
        {children}
      </div>
      {footer ? (
        <footer
          data-mobile-record-card-footer
          className="mt-3 border-t border-border pt-3"
        >
          {footer}
        </footer>
      ) : null}
    </article>
  );
}
