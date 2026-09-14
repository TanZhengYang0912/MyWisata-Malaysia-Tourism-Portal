import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260913090000_product_ticket_admission_policy.sql');

describe('product ticket admission policy migration', () => {
  it('stores supported product policies and derives pass limits from the authoritative product', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('ticket_entry_policy');
    expect(sql).toContain("'single_entry', 'group_entry', 'multi_entry'");
    expect(sql).toContain('apply_product_ticket_pass_policy');
    expect(sql).toContain('BEFORE INSERT ON public.ticket_passes');
    expect(sql).toContain('NEW.entry_limit := v_product.ticket_entry_limit * v_quantity');
    expect(sql).toContain("NEW.policy := 'multi_entry'");
    expect(sql).toContain('make_interval(days => v_product.ticket_validity_days)');
  });
});
