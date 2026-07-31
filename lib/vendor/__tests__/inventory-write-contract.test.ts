import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const productCreateRoute = read('app/api/vendors/[vendorId]/products/route.ts');
const productPatchRoute = read('app/api/vendors/[vendorId]/products/[productId]/route.ts');
const variantCreateRoute = read('app/api/vendors/[vendorId]/products/[productId]/variants/route.ts');
const variantPatchRoute = read('app/api/vendors/[vendorId]/products/[productId]/variants/[variantId]/route.ts');

describe('outlet-aware inventory write contract', () => {
  it('writes the product default inventory row with its outlet identity', () => {
    expect(productCreateRoute).toContain('outlet_id: body.outletId');
  });

  it('upserts edited product inventory on the composite variant and outlet identity', () => {
    expect(productPatchRoute).toMatch(/upsert\(\{\s*variant_id:\s*variant\.id,\s*outlet_id:\s*productOutlet\.id/);
    expect(productPatchRoute).toContain("onConflict: 'variant_id,outlet_id'");
  });

  it('writes newly created variant inventory with its scoped outlet', () => {
    expect(variantCreateRoute).toContain('outlet_id: productOutlet.id');
  });

  it('upserts edited variant inventory on the composite variant and outlet identity', () => {
    expect(variantPatchRoute).toMatch(/upsert\(\{\s*variant_id:\s*variantId,\s*outlet_id:\s*productOutlet\.id/);
    expect(variantPatchRoute).toContain("onConflict: 'variant_id,outlet_id'");
  });
});
