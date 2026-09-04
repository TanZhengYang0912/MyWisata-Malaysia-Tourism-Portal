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
  dispatcher?: OutboxDispatcher,
  limit = 20,
): Promise<{ processed: number; delivered: number; failed: number }> {
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

  for (const event of events as OutboxEventRow[]) {
    await supabase.from("sync_outbox").update({ status: "processing" }).eq("id", event.id);

    try {
      if (dispatcher) {
        await dispatcher(event);
      }
      // Successfully dispatched
      await supabase
        .from("sync_outbox")
        .update({
          status: "delivered",
          last_error: null,
        })
        .eq("id", event.id);
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
    processed: events.length,
    delivered: deliveredCount,
    failed: failedCount,
  };
}
