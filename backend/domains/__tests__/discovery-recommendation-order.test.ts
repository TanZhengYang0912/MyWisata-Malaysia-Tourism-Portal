import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../discovery.ts', import.meta.url), 'utf8');

describe('admin recommendation ordering', () => {
  it('loads recommendations newest first', () => {
    expect(source).toContain('.order("created_at", { ascending: false })');
  });
});
