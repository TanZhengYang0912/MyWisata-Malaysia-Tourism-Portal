import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/recommendations/page.tsx'),
  'utf8',
);

describe('admin recommendation queue row navigation', () => {
  it('uses one semantic detail link for the complete recommendation row', () => {
    expect(pageSource).toContain('aria-label={`${t("ui.actions.viewDetails")}: ${r.name}`}');
    expect(pageSource).toContain('className="group flex flex-wrap items-center gap-4 px-5 py-4');
    expect(pageSource).toContain('href={`/admin/recommendations/${r.id}`}');
  });

  it('uses a decorative arrow instead of a nested View details button', () => {
    expect(pageSource).toContain('<ArrowUpRight aria-hidden="true"');
    expect(pageSource).not.toContain('<Eye size={14} />');
    expect(pageSource).not.toContain('<Button asChild size="sm" variant="outline"><Link href={`/admin/recommendations/${r.id}`}');
  });
});
