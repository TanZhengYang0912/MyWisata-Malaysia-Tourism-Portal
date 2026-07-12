import { cn } from "@/components/utils";

const STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_PAYMENT: "bg-accent/25 text-[#B08020]",
  PAID: "bg-primary/15 text-primary",
  COMPLETED: "bg-primary/15 text-primary",
  CANCELLED: "bg-destructive/12 text-destructive",
  pending:    "bg-accent/25 text-[#B08020]",
  approved:   "bg-primary/15 text-primary",
  rejected:   "bg-destructive/12 text-destructive",
  processing: "bg-blue-100 text-blue-700",
  completed:  "bg-primary/15 text-primary",
  failed:     "bg-destructive/12 text-destructive",
  hold:       "bg-teal/15 text-teal",
};

const LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_PAYMENT: "Pending Payment",
  PAID: "Paid",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  pending:    "Pending",
  approved:   "Approved",
  rejected:   "Rejected",
  processing: "Processing",
  completed:  "Completed",
  failed:     "Failed",
  hold:       "On Hold",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap", STYLES[status] ?? "bg-muted text-muted-foreground", className)}>
      {LABELS[status] ?? status}
    </span>
  );
}
