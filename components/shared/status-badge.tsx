"use client";

import { cn } from "@/components/utils";
import { useTranslation } from "react-i18next";

const STYLES: Record<string, string> = {
  DRAFT:           "bg-muted text-muted-foreground",
  PENDING_PAYMENT: "bg-accent/25 text-amber-800 dark:text-amber-400",
  PAID:            "bg-primary/15 text-primary",
  COMPLETED:       "bg-primary/15 text-primary",
  CANCELLED:       "bg-destructive/12 text-destructive",
  pending:         "bg-accent/25 text-amber-800 dark:text-amber-400",
  pending_review:  "bg-accent/25 text-amber-800 dark:text-amber-400",
  change_requested:"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  changes_requested:"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  approved:        "bg-primary/15 text-primary",
  invited:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  claimed:         "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  onboarding:      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  vendor_pending_review: "bg-accent/25 text-amber-800 dark:text-amber-400",
  converted:       "bg-teal/15 text-teal",
  rejected:        "bg-destructive/12 text-destructive",
  processing:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  completed:       "bg-primary/15 text-primary",
  failed:          "bg-destructive/12 text-destructive",
  paid:            "bg-primary/15 text-primary",
  hold:            "bg-teal/15 text-teal",
};

const LABELS: Record<string, string> = {
  DRAFT:           "Draft",
  PENDING_PAYMENT: "Pending Payment",
  PAID:            "Paid",
  COMPLETED:       "Completed",
  CANCELLED:       "Cancelled",
  pending:         "Pending",
  pending_review:  "Pending review",
  change_requested:"Changes requested",
  changes_requested:"Changes requested",
  approved:        "Approved",
  invited:         "Invited",
  claimed:         "Claimed",
  onboarding:      "Onboarding",
  vendor_pending_review: "Pending vendor review",
  converted:       "Vendor joined",
  rejected:        "Rejected",
  processing:      "Processing",
  completed:       "Completed",
  failed:          "Failed",
  paid:            "Paid",
  hold:            "On Hold",
};

const LABEL_KEYS: Record<string, string> = {
  DRAFT: "statuses.draft",
  PENDING_PAYMENT: "statuses.pendingPayment",
  PAID: "statuses.paid",
  COMPLETED: "statuses.completed",
  CANCELLED: "statuses.cancelled",
  pending: "statuses.pending",
  pending_review: "statuses.pendingReview",
  change_requested: "statuses.changesRequested",
  changes_requested: "statuses.changesRequested",
  approved: "statuses.approved",
  invited: "statuses.invited",
  claimed: "statuses.claimed",
  onboarding: "statuses.onboarding",
  vendor_pending_review: "statuses.vendorPendingReview",
  converted: "statuses.converted",
  rejected: "statuses.rejected",
  processing: "statuses.processing",
  completed: "statuses.completed",
  failed: "statuses.failed",
  paid: "statuses.paid",
  hold: "statuses.onHold",
  overdue: "statuses.overdue",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation("common");
  const labelKey = LABEL_KEYS[status];
  return (
    <span className={cn("text-[0.625rem] font-bold px-2.5 py-1 rounded-full whitespace-nowrap", STYLES[status] ?? "bg-muted text-muted-foreground", className)}>
      {labelKey ? t(labelKey, { defaultValue: LABELS[status] ?? status }) : status}
    </span>
  );
}
