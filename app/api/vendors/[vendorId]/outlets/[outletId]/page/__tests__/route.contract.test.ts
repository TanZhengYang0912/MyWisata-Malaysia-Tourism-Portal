import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), 'utf8');
}

describe('outlet shop page write authorization', () => {
  it('limits draft writes and draft reset to outlet managers', () => {
    const source = read('app/api/vendors/[vendorId]/outlets/[outletId]/page/route.ts');

    expect(source).toContain("authorizeOutlet(vendorId, outletId, ['outlet_manager'])");
    expect(source).toContain('export async function PATCH');
    expect(source).toContain('export async function DELETE');
  });

  it('limits publishing to outlet managers', () => {
    const source = read('app/api/vendors/[vendorId]/outlets/[outletId]/page/publish/route.ts');

    expect(source).toContain("authorizeOutlet(vendorId, outletId, ['outlet_manager'])");
  });
});
