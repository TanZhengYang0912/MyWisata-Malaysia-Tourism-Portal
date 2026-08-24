import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'app/admin/recommendations/rewards/page.tsx';
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('recommendation reward operations page', () => {
  it('uses the shared Admin page shell and owns reward clearing', () => {
    expect(source).toContain('AdminPageShell');
    expect(source).toContain('AdminPageHeader');
    expect(source).toContain('/api/admin/recommendations/run-clearing');
    expect(source).toContain('/admin/recommendations');
  });
});
