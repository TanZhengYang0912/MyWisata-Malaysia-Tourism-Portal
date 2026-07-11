// Contract #6: every approve/reject action must go through this one function
// so AUDIT_LOGS + NOTIFICATIONS always stay in sync.
import { getCollection, KEYS, setCollection } from "./mockdb";
import type { AuditLog, Notification } from "./types";

export function recordApproval(args: {
  actorId: string;
  action: string; // e.g. "vendor.approve", "withdrawal.reject"
  targetType: string;
  targetId: string;
  notifyUserId: string;
  notifyText: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}): void {
  const auditLogs = getCollection<AuditLog>(KEYS.auditLogs);
  const log: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actorId: args.actorId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    note: args.note,
    before: args.before,
    after: args.after,
    createdAt: new Date().toISOString(),
  };
  setCollection(KEYS.auditLogs, [log, ...auditLogs]);

  const notifications = getCollection<Notification>(KEYS.notifications);
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: args.notifyUserId,
    text: args.notifyText,
    read: false,
    createdAt: new Date().toISOString(),
  };
  setCollection(KEYS.notifications, [notification, ...notifications]);
}
