import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  resolve(process.cwd(), 'components/vendor/voucher-csv-builder.tsx'),
  'utf8',
);

describe('voucher CSV builder autosave', () => {
  it('waits for the shared eight-second idle window before server autosave', () => {
    expect(componentSource).toContain('VOUCHER_CSV_AUTOSAVE_DELAY_MS = 8000');
    expect(componentSource).toContain('}, VOUCHER_CSV_AUTOSAVE_DELAY_MS);');
    expect(componentSource).toContain("t('voucher.csv.autosaveNotice')");
    expect(componentSource).not.toContain('Changes save after 8 seconds of inactivity');
    expect(componentSource).not.toContain('}, 1200);');
  });
});
