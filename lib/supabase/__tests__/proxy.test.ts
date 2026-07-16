import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

describe('Supabase SSR session refresh', () => {
  it('refreshes auth claims and forwards refreshed cookies from the Next proxy', () => {
    const proxyImplementation = readFileSync(resolve(root, 'lib/supabase/proxy.ts'), 'utf8');
    const nextProxy = readFileSync(resolve(root, 'proxy.ts'), 'utf8');

    expect(proxyImplementation).toContain('request.cookies.getAll()');
    expect(proxyImplementation).toContain('await supabase.auth.getClaims()');
    expect(proxyImplementation).toContain('supabaseResponse.cookies.set');
    expect(nextProxy).toContain("import { updateSession } from '@/lib/supabase/proxy'");
    expect(nextProxy).toContain('matcher:');
  });
});
