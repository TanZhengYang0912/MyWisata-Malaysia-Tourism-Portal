import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(resolve(process.cwd(), 'app/vendor/layout.tsx'), 'utf8');
const headerSource = readFileSync(resolve(process.cwd(), 'components/layout/vendor-header.tsx'), 'utf8');
const sidebarSource = readFileSync(resolve(process.cwd(), 'components/layout/portal-sidebar.tsx'), 'utf8');

describe('vendor responsive shell contract', () => {
  it('releases the desktop sidebar offset on small screens without reserving a bottom bar', () => {
    expect(layoutSource).toContain('ml-0 min-w-0 overflow-x-clip lg:ml-60');
    expect(layoutSource).not.toContain('pb-20');
  });

  it('clips horizontal overflow without creating scroll containers that break sticky', () => {
    expect(layoutSource).toContain('{ overflow-x: clip; }');
    expect(layoutSource).not.toContain('overflow-x-hidden');
    expect(layoutSource).not.toContain('overflow-x: hidden');
  });

  it('hides the fixed sidebar below lg and opens the same menu from a top-left button', () => {
    expect(sidebarSource).toContain('fixed inset-y-0 left-0 z-40 max-lg:hidden');
    expect(sidebarSource).toContain('fixed left-4 top-3.5 z-50');
    expect(sidebarSource).not.toContain('max-lg:overflow-x-auto');
    expect(headerSource).toContain('pl-16 pr-4');
    expect(headerSource).toContain('lg:pl-6');
  });

  it('does not mount the floating chatbot in the shared vendor and outlet-manager shell', () => {
    expect(layoutSource).not.toContain('ChatbotWidget');
    expect(layoutSource).not.toContain('SupportChatProvider');
  });
});
