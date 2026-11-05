import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { portalArtifacts } from './portal-fixture';

export type PortalPage = { routeTemplate: string; path: string; role: string; fixtureRef?: string; heading?: string; content?: string; apiPath?: string; environment?: 'shared-supabase' | 'mock' };
type Capture = PortalPage & { actualPath: string; readiness: string; criticalApiStatuses: number[]; screenshotPath: string; outcome: 'passed' | 'failed'; failureReason: string | null };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function portalRoutes(directory = join(process.cwd(), 'app')): string[] {
  const routes: string[] = [];
  function visit(folder: string, segments: string[]) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'api') visit(join(folder, entry.name), entry.name.startsWith('(') ? segments : [...segments, entry.name]);
      else if (entry.isFile() && entry.name === 'page.tsx') routes.push(`/${segments.join('/')}`);
    }
  }
  visit(directory, []);
  return routes.sort();
}

/** A screenshot is evidence only after its content and primary API have settled. */
export class PortalGallery {
  private readonly records: Capture[] = [];
  readonly directory = portalArtifacts();
  constructor(private readonly name: string, private readonly authMode: string) {}

  async capture(page: Page, spec: PortalPage) {
    const screenshotPath = `${this.name}-${String(this.records.length + 1).padStart(3, '0')}.png`;
    const statuses: number[] = [];
    let reason: string | null = null;
    const responsePromise = spec.apiPath ? page.waitForResponse(response => new URL(response.url()).pathname === spec.apiPath && response.request().method() === 'GET', { timeout: 25_000 }) : null;
    // Observe failures immediately so a navigation failure cannot leave an unhandled promise.
    const primary = responsePromise?.then(async response => ({ status: response.status(), body: await response.json().catch(() => null) })).catch(() => null);
    try {
      const response = await page.goto(spec.path, { waitUntil: 'domcontentloaded', timeout: 35_000 });
      expect(response?.status(), 'Main document must be successful').toBe(200);
      const actualPath = new URL(page.url()).pathname;
      const isExpectedPublicLogin = spec.role === 'public' && spec.path === '/login' && actualPath === '/login';
      expect(isExpectedPublicLogin || actualPath !== '/login').toBe(true);
      if (primary) {
        const api = await primary;
        expect(api, 'The page primary API must settle').not.toBeNull();
        statuses.push(api!.status);
        expect(api!.status, 'The page primary API must succeed').toBe(200);
        expect(api!.body?.error ?? null).toBeNull();
        expect(api!.body?.data, 'The primary API must return its documented data envelope').toBeTruthy();
      }
      if (spec.heading) await expect(page.getByRole('heading', { name: spec.heading, exact: true })).toBeVisible({ timeout: 20_000 });
      if (spec.content) await expect(page.getByText(spec.content, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/^Loading(?:…|\.\.\.)?$/, { exact: true })).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByText('Your review access is no longer available.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Loading Access Control data…', { exact: true })).toHaveCount(0, { timeout: 20_000 });
    } catch (error) {
      reason = error instanceof Error ? error.message.split('\n')[0].slice(0, 240) : 'Page acceptance failed';
    }
    await page.screenshot({ path: join(this.directory, screenshotPath), fullPage: true, animations: 'disabled' });
    this.records.push({ ...spec, environment: spec.environment ?? 'shared-supabase', actualPath: new URL(page.url()).pathname,
      readiness: reason ? 'failed' : spec.apiPath ? 'content-and-primary-api-settled' : 'visual-smoke-content-settled', criticalApiStatuses: statuses, screenshotPath,
      outcome: reason ? 'failed' : 'passed', failureReason: reason });
    return { passed: reason === null, reason };
  }

  write() {
    writeFileSync(join(this.directory, `${this.name}-manifest.json`), JSON.stringify({ createdAt: new Date().toISOString(), authMode: this.authMode, records: this.records }, null, 2));
    const cards = this.records.map(row => `<article><a href="${escape(row.screenshotPath)}"><img loading="lazy" src="${escape(row.screenshotPath)}" alt="${escape(row.routeTemplate)}"></a><p>${escape(row.role)} · ${escape(row.routeTemplate)} · ${row.outcome}</p><small>${escape(row.failureReason ?? row.readiness)}</small></article>`).join('');
    writeFileSync(join(this.directory, `${this.name}-index.html`), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portal QA ${escape(this.name)}</title><style>body{font:15px system-ui;background:#111827;color:white;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}article{background:#1f2937;padding:10px}img{width:100%;height:280px;object-fit:contain;background:#f8fafc}small{color:#cbd5e1}</style><h1>${escape(this.name)}</h1><p>${escape(this.authMode)}</p><main>${cards}</main>`);
  }
}
