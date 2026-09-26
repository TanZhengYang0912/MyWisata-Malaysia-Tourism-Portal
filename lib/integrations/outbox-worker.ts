import { createServiceClient } from "@/lib/supabase/service";

export interface OutboxEventRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "delivered" | "failed";
  retry_count: number;
  next_retry_at: string;
  last_error: string | null;
  created_at: string;
}

export type OutboxDispatcher = (event: OutboxEventRow) => Promise<void>;

const DEFAULT_MAX_RETRIES = 5;

export async function processOutboxBatch(
  dispatcher: OutboxDispatcher,
  limit = 20,
): Promise<{ processed: number; delivered: number; failed: number }> {
  if (typeof dispatcher !== "function") throw new Error("outbox_dispatcher_required");

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: events, error } = await supabase
    .from("sync_outbox")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_retry_at", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !events || events.length === 0) {
    return { processed: 0, delivered: 0, failed: 0 };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let claimedCount = 0;

  for (const event of events as OutboxEventRow[]) {
    const { data: claimed, error: claimError } = await supabase
      .from("sync_outbox")
      .update({ status: "processing" })
      .eq("id", event.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) {
      failedCount++;
      continue;
    }
    if (!claimed) continue;
    claimedCount++;

    try {
      await dispatcher(event);
      const { error: deliveryStateError } = await supabase
        .from("sync_outbox")
        .update({
          status: "delivered",
          last_error: null,
        })
        .eq("id", event.id);
      if (deliveryStateError) {
        const retryCount = event.retry_count + 1;
        const retryDelaySeconds = Math.min(3600, Math.pow(2, retryCount) * 10);
        const { error: retryStateError } = await supabase
          .from("sync_outbox")
          .update({
            status: "pending",
            retry_count: retryCount,
            next_retry_at: new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
            last_error: "delivery_state_update_failed",
          })
          .eq("id", event.id)
          .eq("status", "processing");
        if (retryStateError) {
          console.error("[sync-outbox] delivery state and retry state updates failed", event.id);
        }
        failedCount++;
        continue;
      }
      deliveredCount++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Dispatch failed";
      const newRetryCount = event.retry_count + 1;

      if (newRetryCount >= DEFAULT_MAX_RETRIES) {
        await supabase
          .from("sync_outbox")
          .update({
            status: "failed",
            retry_count: newRetryCount,
            last_error: errorMessage,
          })
          .eq("id", event.id);
      } else {
        const backoffSeconds = Math.min(3600, Math.pow(2, newRetryCount) * 10);
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();
        await supabase
          .from("sync_outbox")
          .update({
            status: "pending",
            retry_count: newRetryCount,
            next_retry_at: nextRetry,
            last_error: errorMessage,
          })
          .eq("id", event.id);
      }
      failedCount++;
    }
  }

  return {
    processed: claimedCount,
    delivered: deliveredCount,
    failed: failedCount,
  };
}
