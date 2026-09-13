import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'components/vendor/outlet-manager-panel.tsx'),
  'utf8',
);

describe('outlet manager removal confirmation', () => {
  it('uses the reusable confirmation dialog instead of the native browser alert', () => {
    expect(source).toContain("import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';");
    expect(source).toContain('removeConfirmationOpen');
    expect(source).toContain('<ActionConfirmationDialog');
    expect(source).not.toContain("confirm(t('outletManager.removeConfirm'))");
    expect(source).not.toContain('window.confirm');
  });
});
