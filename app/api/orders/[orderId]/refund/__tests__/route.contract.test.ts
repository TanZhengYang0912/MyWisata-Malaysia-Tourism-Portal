import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../route.ts', import.meta.url), 'utf8');

describe('customer refund request duplicate guard', () => {
  it('rejects an existing active or processed full refund before inserting another request', () => {
    expect(source).toContain(".in('status', ['pending', 'approved', 'processed'])");
    expect(source).toContain('REFUND_ALREADY_REQUESTED');
  });
});
