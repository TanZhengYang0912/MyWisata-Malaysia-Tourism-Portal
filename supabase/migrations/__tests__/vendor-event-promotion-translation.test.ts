import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261029223806_vendor_event_promotion_content_translation.sql'), 'utf8');

describe('vendor event promotion translation migration', () => {
  it('extends only the existing translation entity and public fields', () => {
    expect(migration).toContain("'vendor_event_promotion'");
    expect(migration).toContain("WHEN 'vendor_event_promotion' THEN p_field IN ('title', 'details')");
    expect(migration).toContain('public_content_translations_entity_type_check');
    expect(migration).toContain('content_translation_jobs_field_check');
    expect(migration).not.toMatch(/payment|stripe|review_note|rejection_reason/i);
  });

  it('invalidates translations outside the paid visible window and hashes current copy', () => {
    expect(migration).toMatch(/NEW\.status = 'paid' AND NEW\.ends_on >= CURRENT_DATE/i);
    expect(migration).toMatch(/extensions\.digest\(v_source, 'sha256'\)/i);
    expect(migration).toMatch(/UPDATE OF title, details, status, ends_on OR DELETE/i);
    expect(migration).toMatch(/status = 'superseded'/i);
    expect(migration).toMatch(/least\(coalesce\(p_max_backlog, 5000\), 20000\)/i);
    expect(migration).not.toMatch(/backfill_public_content_translation_jobs\(/i);
  });
});
