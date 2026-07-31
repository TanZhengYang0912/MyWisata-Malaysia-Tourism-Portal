import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  resolve(process.cwd(), 'components/vendor/voucher-csv-builder.tsx'),
  'utf8',
);

describe('voucher CSV builder layout', () => {
  it('contains the wide spreadsheet without clipping the dialog or footer', () => {
    expect(componentSource).toContain('!max-w-[1800px]');
    expect(componentSource).toContain('min-w-0 max-h-[96vh]');
    expect(componentSource).toContain('min-w-0 flex-1 overflow-y-auto');
    expect(componentSource).toContain('min-w-[1748px]');
    expect(componentSource).toContain('Scroll horizontally to see more fields');
    expect(componentSource).not.toContain('min-w-[2050px]');
  });
});
