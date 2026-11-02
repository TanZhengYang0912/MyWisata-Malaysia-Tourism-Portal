import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { StatusBadge, STATUS_LABEL_KEYS } from '../status-badge';

describe('withdrawal second approval status', () => {
  it('uses the shared localized status key and pending visual style', () => {
    expect(STATUS_LABEL_KEYS.pending_second_approval).toBe('statuses.pendingSecondApproval');
    const markup = renderToStaticMarkup(<StatusBadge status="pending_second_approval" />);

    expect(markup).toContain('statuses.pendingSecondApproval');
    expect(markup).toContain('bg-accent/25');
  });

  it('defines the status message in every supported common locale', () => {
    for (const locale of ['en', 'zh-CN', 'ms']) {
      const messages = JSON.parse(readFileSync(join(process.cwd(), `app/i18n/locales/${locale}/common.json`), 'utf8')) as {
        statuses?: { pendingSecondApproval?: unknown };
      };
      expect(messages.statuses?.pendingSecondApproval, locale).toEqual(expect.any(String));
      expect(messages.statuses?.pendingSecondApproval, locale).not.toBe('');
    }
  });
});
