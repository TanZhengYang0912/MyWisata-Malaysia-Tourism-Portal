import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const inboxSource = readFileSync(join(process.cwd(), 'app/vendor/inbox/page.tsx'), 'utf8');

describe('Vendor Inbox loading lifecycle', () => {
  it('uses the stable vendor ID rather than the rebuilt auth user object when loading threads', () => {
    expect(inboxSource).toContain("const vendorId = user?.activeVendorId;");
    expect(inboxSource).toContain("if (!vendorId) {");
    expect(inboxSource).toContain("if (showLoading) setLoading(false);");
    expect(inboxSource).toContain("}, [t, vendorId]);");
  });
});
