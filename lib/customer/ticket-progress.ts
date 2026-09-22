export type TicketEntryPolicy = "single_entry" | "multi_entry" | "group_entry";

export function ticketProgress(policy: TicketEntryPolicy, entryLimit: number, entriesUsed: number) {
  const total = Math.max(0, Math.floor(entryLimit));
  const used = Math.min(total, Math.max(0, Math.floor(entriesUsed)));
  return {
    used,
    total,
    remaining: Math.max(0, total - used),
    unit: policy === "group_entry" ? "guests" as const : policy === "multi_entry" ? "visits" as const : "entry" as const,
  };
}
