import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261109042323_kyc_clean_ocr_and_manual_confirmation.sql');

describe('clean OCR source and manual passport approval migration contract', () => {
  it('requires trusted source/artifact/parser binding for every OCR observation and link', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/source_revision/);
    expect(sql).toMatch(/artifact_revision/);
    expect(sql).toMatch(/parser_version/);
    expect(sql).toMatch(/clean_transform_version/);
    expect(sql).toMatch(/record_kyc_draft_ocr_observation_v2/);
    expect(sql).toMatch(/link_kyc_ocr_observation_v2/);
    expect(sql).toMatch(/ocr_source_unavailable/);
  });

  it('keeps legacy drafts manual and only allows complete dual-confirmed current manual facts', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/passport_mrz_status/);
    expect(sql).toMatch(/passport_visual_comparison_status/);
    expect(sql).toMatch(/passport_expiry_date/);
    expect(sql).toMatch(/manual_td3_v1/);
    expect(sql).toMatch(/independent_second/);
    expect(sql).toMatch(/kyc_passport_manual_evidence_required/);
    expect(sql).not.toMatch(/raw_mrz|birth_date text|passport_document_number text/i);
  });

  it('binds clean observations to the database submission revision in the finalize transaction', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/finalize_kyc_submission_with_ocr_v2/);
    expect(sql).toMatch(/v_operation\.request_fingerprint IS DISTINCT FROM v_expected_fingerprint/);
    expect(sql).toMatch(/v_operation\.submission_id IS DISTINCT FROM p_submission_id/);
    expect(sql).toMatch(/v_expected_fingerprint:=encode\(extensions\.digest/);
    expect(sql).toMatch(/o\.artifact_revision=v_current_revision/);
    expect(sql).toMatch(/v_ocr\.status='matched'/);
    expect(sql).toMatch(/kyc_evidence_revision\(p_submission_id\)/);
    expect(sql).toMatch(/link_kyc_ocr_observation_v2\(v_owner,p_draft_id,p_submission_id,p_draft_revision,p_source_revision\)/);
    expect(sql).toMatch(/UPDATE app_private\.kyc_drafts SET state='submitted'/);
    const insert = sql.match(/INSERT INTO app_private\.kyc_ocr_observations\(context_kind,context_id,evidence_revision,artifact_revision,source_revision,[\s\S]*?\)\s*VALUES\('submission',[\s\S]*?\);/);
    expect(insert).not.toBeNull();
    const columns = insert?.[0].match(/INSERT INTO app_private\.kyc_ocr_observations\(([\s\S]*?)\)\s*VALUES/)?.[1]
      ?.split(',').map((column) => column.trim());
    expect(columns).toHaveLength(new Set(columns).size);
    expect(columns?.filter((column) => column === 'issuer_country')).toHaveLength(1);
  });

  it('coordinates one-pass recognition before upload with fenced atomic completion and bounded retention', () => {
    const sql=readFileSync(migrationPath,'utf8');
    expect(sql).toMatch(/'draft_ocr'/);
    expect(sql).toMatch(/claim_kyc_draft_ocr_operation/);
    expect(sql).toMatch(/IF v_claimed THEN RETURN jsonb_build_object\('status','claimed','leaseToken',v_token\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended/);
    expect(sql).toMatch(/state IN \('processing','succeeded'\)/);
    expect(sql).toMatch(/jsonb_build_object\('status',v_operation\.state,'duplicate',true\)/);
    expect(sql).toMatch(/lease_token/);
    expect(sql).toMatch(/lease_expires_at/);
    expect(sql).toMatch(/kyc_operation_key_conflict/);
    expect(sql).toMatch(/needs_reconciliation/);
    expect(sql).toMatch(/record_kyc_draft_ocr_observation_v2\(p_owner_user_id/);
    expect(sql).toMatch(/result_reference=jsonb_build_object\('observationId',v_observation_id,'draftVersion',p_saved_version\)/);
    expect(sql).toMatch(/get_my_kyc_operation/);
    expect(sql).toMatch(/purge_kyc_draft_ocr_operations/);
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).toMatch(/interval '30 days'/);
    expect(sql).toMatch(/SKIP LOCKED/);
  });

  it('uses executable parameter signatures for the protected draft observation RPCs', () => {
    const sql=readFileSync(migrationPath,'utf8');
    for (const schema of ['app_private','public']) {
      const name=`${schema}.record_kyc_draft_ocr_observation_v2`;
      const definition=sql.match(new RegExp(`CREATE FUNCTION ${name.replace('.', '\\.')}\\(([\\s\\S]*?)\\) RETURNS`));
      expect(definition,`${name} definition`).not.toBeNull();
      const definitionTypes=definition![1].split(',').map((argument)=>argument.trim().split(/\s+/u).at(-1));
      const grants=[...sql.matchAll(new RegExp(`(?:REVOKE ALL|GRANT EXECUTE) ON FUNCTION ${name.replace('.', '\\.')}\\(([^)]*)\\)`, 'g'))];
      expect(grants,`${name} grants`).toHaveLength(2);
      for (const grant of grants) {
        expect(grant[1].split(',').map((type)=>type.trim()),`${name} grant signature`).toEqual(definitionTypes);
      }
    }
  });

  it('hands failed or stale private staging paths to the reference-aware orphan cleanup queue',()=>{
    const sql=readFileSync(migrationPath,'utf8');
    expect(sql).toMatch(/is_kyc_draft_storage_path_referenced/);
    expect(sql).toMatch(/p_storage_path IN \(d\.front_storage_path,d\.back_storage_path\)/);
    expect(sql).toMatch(/p_storage_path=ANY\(COALESCE\(d\.retired_storage_paths,'\{\}'::text\[\]\)\)/);
    expect(sql).toMatch(/ADD COLUMN staging_storage_paths text\[\] NOT NULL DEFAULT '\{\}'/);
    expect(sql).toMatch(/register_kyc_draft_ocr_staging_paths/);
    expect(sql).toMatch(/invalid_kyc_staging_path/);
    expect(sql).toMatch(/app_private\.kyc_draft_cleanup_orphans\(owner_user_id,storage_path\)/);
    expect(sql).toMatch(/staging_storage_paths='\{\}'/);
    expect(sql).toMatch(/state='failed'[\s\S]*?staging_storage_paths='\{\}'/);
    expect(sql).toMatch(/state='needs_reconciliation'[\s\S]*?staging_storage_paths='\{\}'/);
    const draftReuseMigration=readFileSync(resolve(process.cwd(),'supabase/migrations/20261104161846_kyc_draft_image_reuse.sql'),'utf8');
    expect(draftReuseMigration).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM app_private\.kyc_drafts d/);
    expect(draftReuseMigration).toMatch(/d\.state='editing'/);
  });
});
