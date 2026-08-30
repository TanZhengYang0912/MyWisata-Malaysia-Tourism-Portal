import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/legacy-migrations/076_recommendation_reward_multivendor.sql', 'utf8');

describe('multi-vendor recommendation reward migration contract', () => {
  it('indexes active vendor conversion windows', () => {
    expect(sql).toContain('recommendation_conversions_active_vendor_idx');
    expect(sql).toContain('(converted_vendor_id, attribution_ends_at, converted_at DESC)');
  });

  it('reverses pending rewards atomically when an order is cancelled or refunded', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_for_order');
    expect(sql).toContain("SET status = 'reversed', reversed_at = now()");
    expect(sql).toContain("'earnings_reverse'");
    expect(sql).toContain("'recommendation_reward_reversed'");
    expect(sql).toContain('ON CONFLICT (event_key) DO NOTHING');
  });

  it('attaches the reversal to both cancellation and refund transitions', () => {
    expect(sql).toContain("NEW.status IN ('cancelled', 'refunded')");
    expect(sql).toContain('recommendation_rewards_order_status_reversal');
  });
});
