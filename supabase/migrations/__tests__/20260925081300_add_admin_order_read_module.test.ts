import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260925081300_add_admin_order_read_module.sql'), 'utf8');

describe('Admin read-only order module migration', () => {
  it('registers the read-only permission, navigation module and legacy Admin assignment', () => {
    expect(sql).toContain("'admin.orders.read'");
    expect(sql).toContain("'/admin/orders'");
    expect(sql).toContain("VALUES ('admin.orders.read', 'admin', 'orders.read'");
    expect(sql).toContain("WHERE role_row.name = 'Legacy Admin'");
    expect(sql).toContain("SELECT module_row.id, 'admin', TRUE");
    expect(sql).toContain('staff_role_permissions');
  });

  it('does not create any order write permission or mutation function', () => {
    expect(sql).not.toMatch(/admin\.orders\.(write|manage|refund|fulfil)/i);
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });
});
