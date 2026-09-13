import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanUserContent } from '../clean';

function mockService(customWords: { term: string; category: string }[] = []): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: customWords }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('cleanUserContent', () => {
  it('masks profanity in display but keeps it real in original', async () => {
    const r = await cleanUserContent('this fucking withdrawal is broken', mockService());
    expect(r.display).toContain('f***');
    expect(r.original).toContain('fucking');
    expect(r.hadProfanity).toBe(true);
    expect(r.hadSlur).toBe(false);
    expect(r.severity).toBe('low');
  });

  it('never leaves raw PII in either display or original', async () => {
    const r = await cleanUserContent('my IC is 990101-14-5678', mockService());
    expect(r.display).not.toContain('990101-14-5678');
    expect(r.original).not.toContain('990101-14-5678');
    expect(r.display).toContain('[IC]');
    expect(r.original).toContain('[IC]');
    expect(r.hadPII).toBe(true);
  });

  it('marks slurs as high severity', async () => {
    const r = await cleanUserContent('you fucking nigger', mockService());
    expect(r.hadSlur).toBe(true);
    expect(r.severity).toBe('high');
    expect(r.display).not.toContain('nigger');
  });

  it('leaves clean text untouched in both fields', async () => {
    const r = await cleanUserContent('how do I withdraw my earnings?', mockService());
    expect(r.display).toBe('how do I withdraw my earnings?');
    expect(r.original).toBe('how do I withdraw my earnings?');
    expect(r.severity).toBe('none');
  });

  it('never rejects — always returns a usable string for any input', async () => {
    const r = await cleanUserContent('', mockService());
    expect(typeof r.display).toBe('string');
    expect(typeof r.original).toBe('string');
  });

  it('masks an admin-added custom word not in the hardcoded list', async () => {
    const r = await cleanUserContent('you are a bengkok scammer', mockService([{ term: 'bengkok', category: 'slur' }]));
    expect(r.display).not.toContain('bengkok');
    expect(r.hadSlur).toBe(true);
    expect(r.severity).toBe('high');
  });
});
