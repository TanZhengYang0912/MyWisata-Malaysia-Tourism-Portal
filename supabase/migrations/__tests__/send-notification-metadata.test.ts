import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261029223808_send_notification_metadata.sql'), 'utf8');

describe('vendor notification metadata migration', () => {
  it('keeps the existing send-notification permission check authoritative', () => {
    expect(sql).toContain('v_notification_id := app_private.send_notification(p_user_id, p_type, p_title, p_body, p_link)');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
  });

  it('only stores a bounded vendor name for known vendor lifecycle events', () => {
    expect(sql).toContain("p_type NOT IN ('vendor_approved', 'vendor_information_requested', 'vendor_rejected', 'vendor_suspended', 'vendor_unsuspended')");
    expect(sql).toContain("(p_metadata - 'vendorName') <> '{}'::jsonb");
    expect(sql).toContain('length(v_vendor_name) NOT BETWEEN 1 AND 255');
    expect(sql).toContain('SET metadata = jsonb_build_object');
    expect(sql).toContain('WHERE id = v_notification_id AND user_id = p_user_id');
    expect(sql).toContain('TO authenticated, service_role');
  });
});
