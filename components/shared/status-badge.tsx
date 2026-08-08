import { cn } from "@/components/utils";

const STYLES: Record<string, string> = {
  DRAFT:           "bg-muted text-muted-foreground",
  PENDING_PAYMENT: "bg-accent/25 text-[#B08020]",
  PAID:            "bg-primary/15 text-primary",
  COMPLETED:       "bg-primary/15 text-primary",
  CANCELLED:       "bg-destructive/12 text-destructive",
  pending:         "bg-accent/25 text-[#B08020]",
  pending_review:  "bg-accent/25 text-[#B08020]",
  change_requested:"bg-orange-100 text-orange-700",
  changes_requested:"bg-orange-100 text-orange-700",
  approved:        "bg-primary/15 text-primary",
  invited:         "bg-blue-100 text-blue-700",
  claimed:         "bg-indigo-100 text-indigo-700",
  onboarding:      "bg-orange-100 text-orange-700",
  vendor_pending_review: "bg-accent/25 text-[#B08020]",
  converted:       "bg-teal/15 text-teal",
  rejected:        "bg-destructive/12 text-destructive",
  processing:      "bg-blue-100 text-blue-700",
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

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap", STYLES[status] ?? "bg-muted text-muted-foreground", className)}>
      {LABELS[status] ?? status}
    </span>
  );
}
