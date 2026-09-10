import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(resolve(process.cwd(), 'app/vendor/layout.tsx'), 'utf8');
const sidebarSource = readFileSync(resolve(process.cwd(), 'components/layout/portal-sidebar.tsx'), 'utf8');

describe('vendor responsive shell contract', () => {
  it('releases the desktop sidebar offset on small screens and reserves bottom-nav space', () => {
    expect(layoutSource).toContain('ml-0 min-w-0 overflow-x-hidden pb-20 lg:ml-60 lg:pb-0');
  });

  it('turns fixed portal navigation into a horizontal mobile bar', () => {
    expect(sidebarSource).toContain('max-lg:h-16');
    expect(sidebarSource).toContain('max-lg:w-full');
    expect(sidebarSource).toContain('max-lg:overflow-x-auto');
    expect(sidebarSource).toContain('max-lg:hidden');
  });
});
