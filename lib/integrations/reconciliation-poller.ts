import { createServiceClient } from "@/lib/supabase/service";

export interface ExternalFeedItem {
  externalBookingId: string;
  slotId: string;
  quantity: number;
  status: "confirmed" | "cancelled";
  guestName?: string;
  guestEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationReport {
  sourceId: string;
  totalFeedItems: number;
  appliedCount: number;
  conflictCount: number;
  errors: string[];
}

export async function reconcileExternalFeed(
  sourceId: string,
  feedItems: ExternalFeedItem[],
): Promise<ReconciliationReport> {
  const supabase = createServiceClient();
  const report: ReconciliationReport = {
    sourceId,
    totalFeedItems: feedItems.length,
    appliedCount: 0,
    conflictCount: 0,
    errors: [],
  };

  // Ensure source exists and sync is active
  const { data: source, error: sourceErr } = await supabase
    .from("external_booking_sources")
    .select("id, sync_enabled")
    .eq("id", sourceId)
    .single();

  if (sourceErr || !source) {
    report.errors.push(`Source ${sourceId} not found`);
    return report;
  }
  if (!source.sync_enabled) {
    report.errors.push(`Sync is disabled for source ${sourceId}`);
    return report;
  }

  for (const item of feedItems) {
    try {
      const action = item.status === "cancelled" ? "cancel" : "book";

      const { data: rpcResult, error: rpcError } = await supabase.rpc("apply_external_reservation", {
        p_source_id: sourceId,
        p_external_booking_id: item.externalBookingId,
        p_slot_id: item.slotId,
        p_quantity: item.quantity,
        p_action: action,
        p_guest_name: item.guestName ?? null,
        p_guest_email: item.guestEmail ?? null,
        p_payload: item.metadata ?? {},
      });

      if (rpcError) {
        report.errors.push(`Failed item ${item.externalBookingId}: ${rpcError.message}`);
        continue;
      }

      const res = rpcResult as { success: boolean; conflict?: string };
      if (res && res.success === false && res.conflict === "overbooked") {
        report.conflictCount++;
      } else {
        report.appliedCount++;
      }
    } catch (err) {
      report.errors.push(
        `Exception processing ${item.externalBookingId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  // Update source last_synced_at
  await supabase
    .from("external_booking_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", sourceId);

  return report;
}
