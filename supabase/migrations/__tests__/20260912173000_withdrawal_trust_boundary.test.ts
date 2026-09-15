import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../20260912173000_withdrawal_trust_boundary.sql', import.meta.url);

function migrationSql() {
  expect(existsSync(migrationUrl), 'withdrawal trust boundary migration must exist').toBe(true);
  return readFileSync(migrationUrl, 'utf8');
}

describe('withdrawal trust boundary migration', () => {
  it('removes authenticated direct submission and rejection execution', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.submit_wallet_withdrawal\(BIGINT, UUID\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reject_wallet_withdrawal\(UUID, TEXT, INET, TEXT\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.(submit_wallet_withdrawal|reject_wallet_withdrawal)\([^;]+TO authenticated/i);
  });

  it('adds service-only idempotent submission with transaction-local TNG binding', () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal_server(');
    expect(sql).toContain("IF COALESCE(auth.role(), '') <> 'service_role'");
    expect(sql).toMatch(/WHERE id = p_user_id FOR UPDATE/i);
    expect(sql).toMatch(/WHERE id = p_request_id FOR UPDATE/i);
    expect(sql).toMatch(/v_existing\.user_id <> p_user_id/i);
    expect(sql).toMatch(/v_existing\.destination_id IS DISTINCT FROM p_destination_id/i);
    expect(sql).toMatch(/v_user\.phone IS DISTINCT FROM p_expected_tng_phone/i);
    expect(sql).toMatch(/v_destination\.provider_reference IS DISTINCT FROM p_expected_provider_reference/i);
    expect(sql).toContain("'replayed', true");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_wallet_withdrawal_server\([\s\S]+TO service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_wallet_withdrawal_server\([^;]+TO authenticated/i);
  });

  it('adds a service-only rejection function that retains approver and self-dealing checks', () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reject_wallet_withdrawal_server(');
    expect(sql).toContain('NOT public.is_approver(p_actor_id)');
    expect(sql).toContain('v_request.user_id = p_actor_id');
    expect(sql).toContain("INSERT INTO public.withdrawal_approvals");
    expect(sql).toContain("'withdrawal.rejected'");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.reject_wallet_withdrawal_server\([\s\S]+TO service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reject_wallet_withdrawal_server\([^;]+TO authenticated/i);
  });

  it('removes direct payout reads and grants only the customer-safe withdrawal projection', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.payout_destinations FROM authenticated/i);
    expect(sql).not.toMatch(/GRANT SELECT ON TABLE public\.payout_destinations TO authenticated/i);
    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.withdrawal_requests FROM authenticated/i);
    expect(sql).toMatch(/GRANT SELECT \(\s*id, user_id, amount, status, requires_dual_approval, destination_label, created_at\s*\)[\s\S]+ON TABLE public\.withdrawal_requests TO authenticated/i);
    expect(sql).not.toMatch(/GRANT SELECT \([^)]*destination_provider_reference/i);
  });

  it('sanitizes historical e-wallet labels before retaining destination_label access', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/UPDATE public\.payout_destinations[\s\S]+SET label = 'TNG eWallet'[\s\S]+WHERE dest_type = 'ewallet'/i);
    expect(sql).toMatch(/UPDATE public\.withdrawal_requests AS wr[\s\S]+SET destination_label = CONCAT\(\s*'TNG eWallet '[\s\S]+FROM public\.payout_destinations AS pd[\s\S]+pd\.dest_type = 'ewallet'/i);
  });
});
