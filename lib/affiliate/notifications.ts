// P4 — Member 4: affiliate commission notifications. CLAUDE-P4-EXTRAS.md
// Extra 3. Reuses the existing `notifications` table (001_initial_schema.sql
// + the event_key/category/metadata columns added by
// 079_wallet_hold_resume_notifications.sql) — no new table.
//
// Fire-and-forget by design: every function here swallows its own errors
// and never throws. This is deliberate defence in depth, not just relying
// on the caller's own try/catch — lib/affiliate/clearing.ts's per-attribution
// loop already has a try/catch, but it feeds a `result.errors` list that
// gets treated as a REAL clearing failure (see its `critical` flag). A
// notification hiccup must never show up there and must never look like a
// money-path problem. Same discipline CLAUDE.md already established for
// onOrderPaid() itself: the commission is what matters, the notification is
// a bonus.
//
// Idempotency: each insert sets a unique `event_key` and upserts with
// `ignoreDuplicates: true` against it (notifications_event_key_unique,
// migration 080) — the same pattern lib/wallet/approver-notifications.ts
// already uses. In practice the CALL SITES here are already idempotent on
// their own (attribution.ts's UNIQUE(order_id) guard; clearing.ts's atomic
// pending->confirmed claim only ever succeeds once per attribution), so
// event_key is belt-and-suspenders, not the only thing preventing a
// double-notify — but it's what protects against it directly, per the
// extras doc's own guardrail, rather than relying on that indirectly.
//
// category: 'recommendations_affiliate' — matches the customer
// NotificationBell's own category filter tab of the same name
// (components/shared/notification-bell.tsx), so these actually show up
// under a sensible filter rather than falling into the DB trigger's
// type-prefix-based default guess.

import type { SupabaseClient } from '@supabase/supabase-js';
import { toRM } from '@/lib/money';

async function insertNotification(
  service: SupabaseClient,
  row: { userId: string; type: string; title: string; body: string; link: string; eventKey: string },
): Promise<void> {
  try {
    const { error } = await service.from('notifications').upsert(
      {
        user_id: row.userId,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        event_key: row.eventKey,
        category: 'recommendations_affiliate',
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (error) {
    console.error(`[affiliate] ${row.type} notification failed`, error instanceof Error ? error.message : error);
  }
}

/** Fired from lib/affiliate/attribution.ts::onOrderPaid(), right after a new attribution row is created. */
export async function notifyCommissionEarned(
  service: SupabaseClient,
  opts: { userId: string; amountRM: number; attributionId: string },
): Promise<void> {
  await insertNotification(service, {
    userId: opts.userId,
    type: 'affiliate_commission_earned',
    title: 'Commission earned!',
    body: `You earned ${toRM(opts.amountRM)} from a referral. It'll be available to withdraw after the standard clearing period.`,
    link: '/customer/affiliate',
    eventKey: `affiliate_commission_earned:${opts.attributionId}`,
  });
}

/** Fired from lib/affiliate/clearing.ts::clearMaturedCommissions(), right after the wallet credit succeeds. */
export async function notifyCommissionCleared(
  service: SupabaseClient,
  opts: { userId: string; amountRM: number; attributionId: string },
): Promise<void> {
  await insertNotification(service, {
    userId: opts.userId,
    type: 'affiliate_commission_cleared',
    title: 'Commission available to withdraw',
    body: `${toRM(opts.amountRM)} is now available to withdraw from your wallet.`,
    link: '/customer/wallet',
    eventKey: `affiliate_commission_cleared:${opts.attributionId}`,
  });
}

/** Fired from lib/affiliate/clearing.ts::rejectAttribution(), an admin manually declining a still-pending commission. */
export async function notifyCommissionRejected(
  service: SupabaseClient,
  opts: { userId: string; amountRM: number; attributionId: string; reason?: string },
): Promise<void> {
  await insertNotification(service, {
    userId: opts.userId,
    type: 'affiliate_commission_rejected',
    title: 'Commission not approved',
    body: `A pending commission of ${toRM(opts.amountRM)} was reviewed and was not approved${opts.reason ? `: ${opts.reason}` : '.'}`,
    link: '/customer/affiliate',
    eventKey: `affiliate_commission_rejected:${opts.attributionId}`,
  });
}

/**
 * Fired from the same clearing step, only when a clearance just pushed the
 * affiliate's CONFIRMED-referral count past a tier threshold (before/after
 * tier name comparison — see clearing.ts). Keyed on the attribution that
 * caused the crossing, not the tier itself, so a user re-crossing the same
 * tier boundary a second time (can't normally happen — tiers only ever go
 * up — but the key shape stays consistent with the other two functions).
 */
export async function notifyTierUp(
  service: SupabaseClient,
  opts: { userId: string; tierName: string; ratePercent: number; attributionId: string },
): Promise<void> {
  await insertNotification(service, {
    userId: opts.userId,
    type: 'affiliate_tier_up',
    title: `You've reached ${opts.tierName} tier!`,
    body: `Your affiliate commission rate is now ${opts.ratePercent}%.`,
    link: '/customer/affiliate',
    eventKey: `affiliate_tier_up:${opts.attributionId}`,
  });
}
