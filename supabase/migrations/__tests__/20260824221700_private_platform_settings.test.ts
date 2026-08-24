import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260824221700_private_platform_settings.sql',
);

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function migrationSource() {
  expect(existsSync(migrationPath), 'private settings migration must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8');
}

describe('private platform settings migration', () => {
  it('removes world-readable policies and table grants', () => {
    const sql = migrationSource();

    expect(sql).toContain('DROP POLICY IF EXISTS settings_read ON public.platform_settings');
    expect(sql).toContain('DROP POLICY IF EXISTS settings_super_admin_write ON public.platform_settings');
    expect(sql).toContain('REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated');
    expect(sql).not.toMatch(/GRANT\s+SELECT[^;]*\b(?:anon|authenticated)\b/i);
  });

  it('keeps platform settings available to server-only service operations', () => {
    const sql = migrationSource();

    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_settings TO service_role');
  });

  it('uses service clients for the proven API settings readers', () => {
    const walletRoute = source('app/api/admin/wallet-settings/route.ts');
    const affiliateRoute = source('app/api/affiliate/link/route.ts');
    const chatRoute = source('app/api/admin/chat-settings/route.ts');

    expect(walletRoute).toMatch(/const service = createServiceClient\(\);[\s\S]*?service\.from\('platform_settings'\)/);
    expect(affiliateRoute).toContain('getMonthlyClickCap(createServiceClient())');
    expect(chatRoute).toContain('getChatArchiveDays(createServiceClient())');
    expect(chatRoute).toMatch(/createServiceClient\(\)[\s\S]*?\.from\('platform_settings'\)[\s\S]*?\.upsert/);
  });
});
