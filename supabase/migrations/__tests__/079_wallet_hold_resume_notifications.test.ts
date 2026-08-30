import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/legacy-migrations/079_wallet_hold_resume_notifications.sql';

describe('wallet hold/resume notification migration contract', () => {
  it('adds approval cycles, customer reason metadata, and support linkage', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('approval_cycle INTEGER NOT NULL DEFAULT 1');
    expect(sql).toContain('customer_reason_category TEXT');
    expect(sql).toContain('reason_category TEXT');
    expect(sql).toContain('withdrawal_id UUID REFERENCES public.withdrawal_requests');
  });

  it('adds idempotent notification events and metadata-only moderation attempts', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('event_key TEXT');
    expect(sql).toContain('notifications_event_key_unique');
    expect(sql).toContain('wallet_moderation_attempts');
    expect(sql).toContain('wallet_moderation_attempts_service_only');
    expect(sql).toContain('model_categories TEXT[]');
    expect(sql).not.toContain('raw_reason');
  });

  it('supports resume actions and expanded wallet email events', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("'resume'");
    expect(sql).toContain('resume_wallet_withdrawal');
    expect(sql).toContain('approval_cycle = v_request.approval_cycle');
    expect(sql).toContain('withdrawal_resumed');
    expect(sql).toContain('topup_refunded');
    expect(sql).toContain('recommendation_reward_available');
    expect(sql).toContain('attempts < 5');
  });
});
