import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../../legacy-migrations/092_recommendation_evidence_and_reward_reversals.sql', import.meta.url);

describe('092 recommendation evidence and reward reversals migration', () => {
  it('adds private recommendation evidence and all pending-reward reversal outcomes', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.recommendation_images');
    expect(sql).toContain("status IN ('cancelled', 'refunded', 'chargeback', 'fraud')");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_for_order');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_order_financial_outcome');
    expect(sql).toContain('FOR UPDATE OF rc SKIP LOCKED');
    expect(sql).toContain('recommendation-images');
    expect(sql).toContain('contact_phone');
  });
});
