// §11.2.7 — generic client-side signal sink. The activity detail page beacons a
// 'view' with dwell time here; other explicit signals (save/share) are recorded
// server-side at their own routes. Anonymous users are silently ignored.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiOk, parseBody } from "@/lib/validation/schemas";
import { recordInteraction } from "@/lib/interactions";

const schema = z.object({
  event: z.enum(["view", "book", "rate"]),
  entityType: z.enum(["vendor", "outlet", "product"]),
  entityId: z.string().uuid(),
  dwellMs: z.number().int().min(0).max(3_600_000).optional(),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiOk({ recorded: false }); // no-op for guests, not an error

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { event, entityType, entityId, dwellMs } = parsed.data;

  await recordInteraction(supabase, user.id, event, entityType, entityId, dwellMs);
  return apiOk({ recorded: true }, { status: 201 });
}
