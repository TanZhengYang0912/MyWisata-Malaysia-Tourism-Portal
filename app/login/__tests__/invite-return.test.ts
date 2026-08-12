import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('login invitation return contract', () => {
  it('uses the validated next path throughout sign-in and account creation', () => {
    expect(source).toContain('function requestedNext');
    expect(source).toMatch(/requestedNext\(\) \?\? ["']\/customer\/explore["']/);
    expect(source).toContain('/auth/callback?next=');
    expect(source).not.toContain('emailRedirectTo: `${window.location.origin}/auth/callback?next=/customer/explore`');
    expect(source).not.toContain('router.push("/customer/explore")');
  });
});
