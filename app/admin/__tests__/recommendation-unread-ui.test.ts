import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve(process.cwd(), 'app/admin/layout.tsx'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'app/admin/recommendations/page.tsx'), 'utf8');

describe('admin recommendation unread state UI', () => {
  it('polls and displays a Super Admin recommendation unread count', () => {
    expect(layout).toContain('/api/admin/recommendations/unread-count');
    expect(layout).toContain('unreadRecommendations');
    expect(layout).toContain('item.href === "/admin/recommendations"');
    expect(layout).toContain('currentUser.role === "super_admin"');
  });

  it('marks Recommendations as seen when a Super Admin opens the queue', () => {
    expect(page).toContain('/api/admin/recommendations/mark-seen');
    expect(page).toContain('currentUser?.role === "super_admin"');
  });
});
