import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../100_provider_event_settlement_backfill.sql', import.meta.url);

describe('provider event settlement backfill migration', () => {
  it('adds only the missing provider settlement objects', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain("to_regprocedure('public.complete_withdrawal_payout(uuid,text,text)')");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.payout_provider_events');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.settle_provider_withdrawal');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.mark_provider_withdrawal_processing');
  });

  it('keeps wallet and provider histories append-only', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.wallet_transactions\s+FROM anon, authenticated, service_role/i);
    expect(sql).toContain('wallet_transactions_are_append_only');
    expect(sql).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.wallet_transactions/i);
    expect(sql).toContain('payout_provider_events_are_append_only');
    expect(sql).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.payout_provider_events/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.payout_provider_events\s+FROM PUBLIC, anon, authenticated, service_role/i);
  });

  it('makes signed callback settlement service-only and idempotent', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain("COALESCE(auth.role(), '') <> 'service_role'");
    expect(sql).toContain('ON CONFLICT (provider, event_id) DO NOTHING');
    expect(sql).toContain("RAISE EXCEPTION 'provider_event_conflict'");
    expect(sql).toContain('public.complete_withdrawal_payout(');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.settle_provider_withdrawal\([\s\S]+?\) FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.settle_provider_withdrawal\([\s\S]+?\) TO service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.settle_provider_withdrawal[\s\S]+?TO (anon|authenticated)/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
