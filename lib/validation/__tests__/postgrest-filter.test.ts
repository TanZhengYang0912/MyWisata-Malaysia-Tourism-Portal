import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeVoucherCode, postgrestSearchTerm } from '@/lib/validation/postgrest-filter';

describe('postgrestSearchTerm', () => {
  it('cannot add conditions to an .or() filter string', () => {
    const attack = 'x%,user_id.neq.null),and(status.eq.paid';
    const term = postgrestSearchTerm(attack);

    expect(term).not.toMatch(/[%*,()"\\]/);
    expect(`name.ilike.%${term}%,email.ilike.%${term}%`.split(',')).toHaveLength(2);
  });

  it('keeps ordinary search text and caps the length', () => {
    expect(postgrestSearchTerm('  Kedai  Kopi  ')).toBe('Kedai Kopi');
    expect(postgrestSearchTerm("O'Brien & Sons")).toBe("O'Brien & Sons");
    expect(postgrestSearchTerm('a'.repeat(300))).toHaveLength(100);
    expect(postgrestSearchTerm(null)).toBe('');
  });
});

describe('exact lookups', () => {
  it('normalises voucher codes and emails the way they are stored', () => {
    expect(normalizeVoucherCode('  save10 ')).toBe('SAVE10');
    expect(normalizeEmail(' Owner@Example.COM ')).toBe('owner@example.com');
  });
});

// Guard: any .or() whose filter string is built from variables must either use
// postgrestSearchTerm or be listed here with why its values can't come from users.
const REVIEWED_SERVER_VALUES: Record<string, string> = {
  'app/api/admin/access-control/audit-log/route.ts': 'filters validated by strict zod regex/enum/uuid (auditLogFiltersSchema)',
  'app/api/vendors/[vendorId]/vouchers/analytics/route.ts': 'outletId checked against the vendor allow-list first',
  'app/api/vendors/[vendorId]/products/route.ts': 'outlet ids from the server-side vendor scope',
  'lib/vendor/product-scope.ts': 'outlet ids from the server-side vendor scope',
  'backend/domains/commerce.ts': 'pagination cursor taken from database rows',
  'lib/integrations/outbox-worker.ts': 'server-generated timestamp',
  'lib/recommendations/reward-attribution.ts': 'server-generated timestamp',
  'lib/vendor-dashboard.ts': 'outlet ids from the server-side vendor scope',
  'lib/affiliate/earnings-export.ts': 'cursor timestamps and ids come from the previous database page',
  'app/api/admin/orders/[orderId]/guest-contact/route.ts': 'orderId is UUID-validated before constructing the PostgREST filter',
  'app/api/chatbot/history/route.ts': 'cursor timestamp and UUID are validated by strict zod before constructing the filter',
  'app/api/support/tickets/[id]/read/route.ts': 'timestamp comes from the matched database reply row, not request input',
  'lib/support/reply-pagination.ts': 'only support reply routes call this helper; any user cursor is validated as ISO timestamp and UUID first',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('.or() filter strings', () => {
  it('only interpolate cleaned search text or reviewed server values', () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of ['app', 'lib', 'backend', 'components'].flatMap((dir) => sourceFiles(resolve(root, dir)))) {
      const rel = relative(root, file).split('\\').join('/');
      const source = readFileSync(file, 'utf8');
      const builtFromVariables = /\.or\(\s*(`[^`]*\$\{|['"][^'"]*['"]\s*\+|[A-Za-z_$][\w$.]*\.join\()/.test(source);
      if (!builtFromVariables) continue;
      if (source.includes('postgrestSearchTerm(') || rel in REVIEWED_SERVER_VALUES) continue;
      offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
