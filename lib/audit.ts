// ── Audit & Notification Helper ─────────────────────────────
// Wraps the SECURITY DEFINER RPCs record_audit_and_notify + send_notification.
//
// Why RPCs: audit_logs and notifications have RLS enabled with no INSERT
// policies. Client inserts would silently fail. The RPC bypasses RLS by
// running as postgres, while enforcing its own permission checks.
//
// Every approve/reject / state transition MUST end with a call to
// auditAndNotify() — this is Gate 5 in the module plan.

import { createClient } from '@/lib/supabase/server';

export interface AuditParams {
  /** @deprecated actor_id is derived from auth.uid() in the RPC, this field is ignored */
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown>;
  afterData?:  Record<string, unknown>;
  note?: string;
}

export interface NotifyParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditResult {
  audit_id: string;
  notification_ids: string[];
  notification_count: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate the JSON envelope returned by the audit RPC before exposing it. */
export function parseAuditResult(value: unknown): AuditResult | null {
  if (!isRecord(value)
      || typeof value.audit_id !== 'string'
      || !Array.isArray(value.notification_ids)
      || !value.notification_ids.every((id) => typeof id === 'string')
      || !Number.isSafeInteger(value.notification_count)
      || (value.notification_count as number) < 0
      || value.notification_count !== value.notification_ids.length) {
    return null;
  }

  return {
    audit_id: value.audit_id,
    notification_ids: value.notification_ids as string[],
    notification_count: value.notification_count as number,
  };
}

/**
 * Combined audit + N notifications in ONE transaction.
 * Recipient check: users can only notify themselves; admins can notify anyone.
 */
export async function auditAndNotify(
  audit: AuditParams,
  notifications: NotifyParams[] = [],
): Promise<AuditResult | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('record_audit_and_notify', {
    p_action:      audit.action,
    p_entity_type: audit.entityType,
    p_entity_id:   audit.entityId,
    p_before_data: audit.beforeData ?? null,
    p_after_data:  audit.afterData  ?? null,
    p_note:        audit.note       ?? null,
    p_notifications: notifications.map((n) => ({
      user_id: n.userId,
      type:    n.type,
      title:   n.title,
      body:    n.body ?? null,
      link:    n.link ?? null,
      metadata: n.metadata ?? {},
    })),
  });

  if (error) {
    console.error('[audit] RPC failed', {
      action: audit.action,
      entity: `${audit.entityType}:${audit.entityId}`,
      error: error.message,
    });
    return null;
  }
  const result = parseAuditResult(data);
  if (!result) {
    console.error('[audit] RPC returned malformed data', {
      action: audit.action,
      entity: `${audit.entityType}:${audit.entityId}`,
    });
  }
  return result;
}

/** Audit without notifications. */
export async function recordAudit(audit: AuditParams): Promise<AuditResult | null> {
  return auditAndNotify(audit, []);
}

/** Send a single notification. Uses send_notification RPC (no audit row). */
export async function sendNotification(params: NotifyParams): Promise<string | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('send_notification', {
    p_user_id: params.userId,
    p_type:    params.type,
    p_title:   params.title,
    p_body:    params.body ?? null,
    p_link:    params.link ?? null,
  });

  if (error) {
    console.error('[notify] RPC failed', { recipient: params.userId, error: error.message });
    return null;
  }
  return data as string;
}
