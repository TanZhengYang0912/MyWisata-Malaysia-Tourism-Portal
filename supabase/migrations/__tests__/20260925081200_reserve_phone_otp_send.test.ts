import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260925081200_reserve_phone_otp_send.sql'), 'utf8');

describe('atomic OTP send reservation migration', () => {
  it('serializes per-service, per-account and per-phone budgets before insertion', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("'otp:global'");
    expect(sql).toContain("'otp:user:' || v_user::TEXT");
    expect(sql).toContain("'otp:phone:' || p_phone");
    expect(sql).toContain("created_at >= v_now - INTERVAL '1 hour'");
    expect(sql).toMatch(/INSERT INTO public\.phone_verifications[\s\S]*RETURNING id INTO v_reservation_id/);
  });

  it('accepts a server-supplied account only from the service role', () => {
    expect(sql).toContain('p_user_id UUID');
    expect(sql).toContain('v_user UUID := p_user_id');
    expect(sql).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(sql).toContain('IF v_user IS NULL THEN RAISE EXCEPTION');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reserve_phone_otp_send\(UUID, TEXT\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_phone_otp_send\(UUID, TEXT\) TO service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reserve_phone_otp_send\(UUID, TEXT\) TO authenticated/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.reserve_phone_otp_send\(TEXT\)/);
  });
});
