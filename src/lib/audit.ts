// ── Audit & Notification Helper ─────────────────────────────
// Every approve/reject action MUST call recordAudit().
// This is Gate 5 from the module plan.

import { createClient } from '@/lib/supabase/server';

interface AuditParams {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  note?: string;
}

interface NotifyParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export async function recordAudit(params: AuditParams) {
  const db = await createClient();
  const { error } = await db.from('audit_logs').insert({
    actor_id:    params.actorId,
    action:      params.action,
    entity_type: params.entityType,
    entity_id:   params.entityId,
    before_data: params.beforeData ?? null,
    after_data:  params.afterData  ?? null,
    note:        params.note       ?? null,
  });
  if (error) console.error('[audit] insert failed', error);
}

export async function sendNotification(params: NotifyParams) {
  const db = await createClient();
  const { error } = await db.from('notifications').insert({
    user_id: params.userId,
    type:    params.type,
    title:   params.title,
    body:    params.body  ?? null,
    link:    params.link  ?? null,
  });
  if (error) console.error('[notify] insert failed', error);
}

/** Convenience: audit + notify in one call (most approve/reject flows) */
export async function auditAndNotify(
  audit: AuditParams,
  notifications: NotifyParams[],
) {
  await Promise.all([
    recordAudit(audit),
    ...notifications.map(sendNotification),
  ]);
}
