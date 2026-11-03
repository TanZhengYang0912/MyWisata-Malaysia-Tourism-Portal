import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(process.cwd(), 'supabase/migrations');

function migration(slug: string): string {
  const matches = readdirSync(directory).filter((file) => file.endsWith(`_${slug}.sql`));
  expect(matches, `expected one migration for ${slug}`).toHaveLength(1);
  return readFileSync(resolve(directory, matches[0]), 'utf8');
}

describe('KYC identity uniqueness migration', () => {
  it('starts with a closed database gate and a database-enforced one-active-identity invariant', () => {
    const sql = migration('kyc_identity_uniqueness');

    expect(sql).toMatch(/CREATE TABLE app_private\.kyc_identity_control/);
    expect(sql).toMatch(/status\s+text[\s\S]*?CHECK\s*\(status\s+IN\s*\([^)]*blocked/i);
    expect(sql).toMatch(/INSERT INTO app_private\.kyc_identity_control[\s\S]*?'blocked'/i);
    expect(sql).toMatch(/CREATE TABLE app_private\.kyc_identity_bindings/);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*?identity_scope[\s\S]*?owner_user_id[\s\S]*?WHERE\s+state\s*=\s*'active'/i);
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER[\s\S]*?DEFERRABLE INITIALLY DEFERRED/i);
  });

  it('requires two explicitly supplied, distinct confirmations for a high-risk approval', () => {
    const sql = migration('kyc_identity_uniqueness');

    expect(sql).toMatch(/CREATE FUNCTION public\.review_kyc_case_v2\(\s*p_submission_id uuid,\s*p_user_id uuid,\s*p_expected_version bigint,\s*p_action text,\s*p_reason_code text,\s*p_reason_detail text,\s*p_operation_id uuid,\s*p_primary_confirmation_id uuid,\s*p_secondary_confirmation_id uuid\s*\)/i);
    expect(sql).toMatch(/p_primary_confirmation_id\s+IS\s+NULL[\s\S]*p_secondary_confirmation_id\s+IS\s+NULL/);
    expect(sql).toMatch(/p_secondary_confirmation_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+p_primary_confirmation_id/);
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'session_id'/);
    expect(sql).toMatch(/auth\.sessions/);
    expect(sql).toMatch(/s\.not_after IS NULL OR s\.not_after > clock_timestamp\(\)/);
  });

  it('requires both current evidence access audits before staging a manual confirmation', () => {
    const sql = migration('kyc_identity_uniqueness');
    expect(sql).toMatch(/cardinality\(coalesce\(p_document_access_refs, '\{\}'\)\) <> 2/);
    expect(sql).toMatch(/a\.actor_id = p_expected_actor_id[\s\S]*?a\.entity_id = p_submission_id[\s\S]*?evidence_revision/);
  });

  it('makes every legacy approval path reject approval and keeps private proof data inaccessible', () => {
    const sql = migration('kyc_identity_uniqueness');

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION app_private\.review_kyc_case\([\s\S]*?p_action\s*=\s*'approve'[\s\S]*?kyc_upgrade_required/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION app_private\.admin_review_kyc\([\s\S]*service_role/i);
    for (const table of ['kyc_review_confirmations', 'kyc_identity_bindings', 'kyc_identity_events', 'kyc_identity_resolutions', 'kyc_identity_control']) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toMatch(/REVOKE ALL ON TABLE app_private\.%I FROM PUBLIC, anon, authenticated, service_role/i);
  });

  it('checks other reviewers through a private permission resolver and pins TTL in database configuration', () => {
    const sql = migration('kyc_identity_uniqueness');
    expect(sql).toMatch(/CREATE FUNCTION app_private\.kyc_user_has_review_permission/);
    expect(sql).toMatch(/list_kyc_countersign_candidates[\s\S]*?kyc_user_has_review_permission\(u\.id\)/);
    expect(sql).toMatch(/confirmation_ttl_seconds integer/);
    expect(sql.match(/p_ttl_seconds IS DISTINCT FROM v_ttl/g)).toHaveLength(3);
    expect(sql).toMatch(/CREATE FUNCTION app_private\.stage_kyc_resolution_confirmation/);
  });

  it('makes approved identity facts immutable outside controlled resolution', () => {
    const sql = migration('kyc_identity_uniqueness');
    expect(sql).toMatch(/CREATE TRIGGER kyc_approved_identity_immutable[\s\S]*?BEFORE UPDATE ON public\.kyc_submissions/);
    expect(sql).toContain('kyc_approved_identity_immutable');
    expect(sql).toMatch(/v_has_verified_identity[\s\S]*?verified_kyc_submission_id=OLD\.id[\s\S]*?current_verified_submission_id=OLD\.id/);
    expect(sql).toMatch(/OLD\.status='approved' AND NEW\.status IN \('pending','info_requested','draft'\)/);
    expect(sql).toMatch(/NEW\.ic_hash IS DISTINCT FROM OLD\.ic_hash[\s\S]*?kyc_approved_identity_immutable/);
  });
});
