import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'app/admin/orders/page.tsx'), 'utf8');

describe('Admin orders page contract', () => {
  it('loads the current paginated order projection without any mutation controls', () => {
    expect(page).toContain('/api/admin/orders?');
    expect(page).toContain("cache: 'no-store'");
    expect(page).toContain('AdminPageShell');
    expect(page).toContain('AdminFilterBar');
    expect(page).not.toMatch(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
  });
});
