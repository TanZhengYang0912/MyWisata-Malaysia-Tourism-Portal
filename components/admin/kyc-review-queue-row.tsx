import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { AdminKycSubmission, User } from "@/backend/core/types";

type KycReviewQueueRowProps = {
  user: User;
  submission: AdminKycSubmission;
  submittedLabel: string;
  documentLabel: string;
  statusLabel: string;
  reviewLabel: string;
  href: string;
};

export function KycReviewQueueRow({
  user,
  submission,
  submittedLabel,
  documentLabel,
  statusLabel,
  reviewLabel,
  href,
}: KycReviewQueueRowProps) {
  const statusClassName = submission.status === "info_requested"
    ? "bg-accent text-accent-foreground"
    : "bg-primary/10 text-primary";

  return (
    <Link
      href={href}
      aria-label={`${reviewLabel}: ${user.name}`}
      className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {user.avatarInitial}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-foreground">{user.name}</p>
            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClassName}`}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{documentLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{submittedLabel}</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary">
        {reviewLabel}
        <ArrowRight size={14} />
      </span>
    </Link>
  );
}
