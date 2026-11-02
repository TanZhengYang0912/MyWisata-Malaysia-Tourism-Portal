import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261028181502_task_b_verification_affiliate_eligibility.sql'), 'utf8');

describe('Task B verification and Affiliate migration contract', () => {
  it('uses only the five core Profile fields and leaves Survey outside Profile completion', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.profile_completion_eligible');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION app_private.promote_to_profile_complete');
    expect(migration).toContain('travel_style');
    const profileEligibilityFunction = migration.match(
      /CREATE OR REPLACE FUNCTION public\.profile_completion_eligible[\s\S]*?\$\$;/,
    )?.[0];
    expect(profileEligibilityFunction).toBeDefined();
    expect(profileEligibilityFunction).not.toContain('preference_survey_responses');
  });

  it('keeps Purchase on Email/Guest rules without adding a Phone check', () => {
    expect(migration).toContain('public.customer_is_active_email_verified(NEW.user_id)');
    expect(migration).toContain('public.customer_is_active_email_verified(NEW.customer_id)');
    expect(migration).toMatch(/'commerce\.booking','commerce\.purchase','commerce\.checkout'[\s\S]*?email_verified/);
    expect(migration).not.toMatch(/'commerce\.booking','commerce\.purchase','commerce\.checkout'[\s\S]{0,200}phone_verified/);
  });

  it('requires cumulative Phone and Profile facts for earning and withdrawal', () => {
    expect(migration).toContain("'affiliate.earn_commission'");
    expect(migration).toContain("'wallet.request_withdrawal'");
    expect(migration).toContain('v_owner.phone_verified_at IS NULL');
    expect(migration).toContain('public.profile_completion_eligible(v_user_id)');
    expect(migration).toContain('u.phone_verified_at IS NOT NULL AND u.profile_completed_at IS NOT NULL');
  });

  it('projects only a derived public badge boolean and does not rewrite financial rows', () => {
    expect(migration).toContain('is_verified_contributor boolean NOT NULL DEFAULT false');
    expect(migration).toContain('NEW.email_verified_at IS NOT NULL AND NEW.phone_verified_at IS NOT NULL');
    expect(migration).not.toMatch(/UPDATE public\.(wallets|wallet_transactions|affiliate_attributions)/i);
  });
});
