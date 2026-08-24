import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/wallet/settings/page.tsx'),
  'utf8',
);

describe('wallet settings loading contract', () => {
  it('loads wallet policy independently from the approver directory', () => {
    expect(pageSource).toContain('const [settingsLoading, setSettingsLoading] = useState(true)');
    expect(pageSource).toContain('fetch("/api/admin/wallet-settings"');
    expect(pageSource).not.toContain('fetch("/api/admin/wallet-approvers"');
    expect(pageSource).not.toContain('Promise.all([fetch');
  });

  it('bounds the policy request and offers an explicit retry after failure', () => {
    expect(pageSource).toContain('const SETTINGS_LOAD_TIMEOUT_MS = 8_000');
    expect(pageSource).toContain('new AbortController()');
    expect(pageSource).toContain('signal: controller.signal');
    expect(pageSource).toContain('onClick={() => void loadSettings()}');
    expect(pageSource).toContain('t("ui.walletSettings.retry")');
  });
});
