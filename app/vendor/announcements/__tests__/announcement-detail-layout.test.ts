import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'app/vendor/announcements/[id]/page.tsx'),
  'utf8',
);

describe('vendor announcement detail layout', () => {
  it('uses the announcement list content width and spacing', () => {
    expect(source).toContain('className="w-full space-y-6"');
    expect(source).not.toContain('max-w-2xl');
    expect(source).not.toContain('className="mx-auto max-w-2xl space-y-6 p-6"');
  });
});
