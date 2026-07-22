// §11.2.7 feedback loop — writes explicit/implicit signals into user_interactions
// (the ranking + learned-affinity input) and refreshes the user's learned
// affinity. Best-effort: a signal failure must NEVER break the primary action
// (saving, sharing, reviewing), so everything is swallowed.

import type { SupabaseClient } from "@supabase/supabase-js";

export type InteractionEvent = "view" | "save" | "share" | "book" | "rate";
export type InteractionEntity = "vendor" | "outlet" | "product";

export async function recordInteraction(
  db: SupabaseClient,
  userId: string,
  event: InteractionEvent,
  entityType: InteractionEntity,
  entityId: string,
  dwellMs?: number,
): Promise<void> {
  try {
    await db.from("user_interactions").insert({
      user_id: userId,
      event_type: event,
      entity_type: entityType,
      entity_id: entityId,
      dwell_ms: dwellMs ?? null,
    });
    // Keep the "Based on your activity" memory current.
    await db.rpc("refresh_learned_affinity", { p_user_id: userId });
  } catch {
    // Signals are non-critical — never surface to the caller.
  }
}
