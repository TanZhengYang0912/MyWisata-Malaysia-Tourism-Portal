import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260824222100_provider_verification_evidence.sql');

function migrationSource() {
  expect(existsSync(migrationPath), 'provider verification evidence migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('provider verification evidence migration', () => {
  it('persists verification result, method and ingestion source on append-only events', () => {
    const sql = migrationSource();

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS verification_method TEXT');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ingestion_source TEXT');
    expect(sql).toMatch(/INSERT INTO public\.payout_provider_events\([\s\S]*signature_verified[\s\S]*verification_method[\s\S]*ingestion_source/);
  });

  it('rejects settlement without verified HMAC evidence and removes the old callable signature', () => {
    const sql = migrationSource();

    expect(sql).toContain('DROP FUNCTION IF EXISTS public.settle_provider_withdrawal(');
    expect(sql).toContain("IF p_signature_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'provider_verification_required'; END IF;");
    expect(sql).toContain("IF p_verification_method <> 'hmac_sha256' THEN RAISE EXCEPTION 'provider_verification_method_invalid'; END IF;");
    expect(sql).toContain("IF p_ingestion_source <> 'tng_mock_webhook' THEN RAISE EXCEPTION 'provider_ingestion_source_invalid'; END IF;");
  });

  it('builds settlement proof from stored evidence instead of a true constant', () => {
    const sql = migrationSource();

    expect(sql).toContain("'signatureVerified', v_event.signature_verified");
    expect(sql).toContain("'verificationMethod', v_event.verification_method");
    expect(sql).toContain("'ingestionSource', v_event.ingestion_source");
    expect(sql).not.toContain("'signatureVerified', true");
  });
});
