// Contract #6: every approve/reject action must go through this one function
// so audit_logs + notifications always stay in sync.
import { supabase } from "@/backend/supabase";

export async function recordApproval(args: {
  actorId: string;
  action: string; // e.g. "vendor.approve", "withdrawal.reject"
  targetType: string;
  targetId: string;
  notifyUserId: string;
  notifyText: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const { error: logErr } = await supabase.from("audit_logs").insert({
    actor_id: args.actorId,
    action: args.action,
    entity_type: args.targetType,
    entity_id: args.targetId,
    note: args.note ?? null,
    before_data: args.before ?? null,
    after_data: args.after ?? null,
  });
  if (logErr) throw logErr;

  const { error: notifErr } = await supabase.from("notifications").insert({
    user_id: args.notifyUserId,
    type: args.action,
    title: args.notifyText,
  });
  if (notifErr) throw notifErr;
}
