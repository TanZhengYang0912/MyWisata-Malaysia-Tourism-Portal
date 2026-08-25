import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('AI draft email response handoff', () => {
  it('passes successful API response data to the caller', () => {
    const modalSource = source('components/admin/ai-draft-email-modal.tsx');

    expect(modalSource).toContain('data: unknown');
    expect(modalSource).toContain('onSent(target.id, responseBody.data)');
  });

  it('warns when a delivered recommendation invite did not synchronize status', () => {
    const detailSource = source('components/admin/recommendation-detail-view.tsx');

    expect(detailSource).toContain('statusSynced');
    expect(detailSource).toContain('recommendation.detail.feedback.inviteStatusSyncFailed');
  });

  it('localizes the synchronization warning in every admin locale', () => {
    for (const locale of ['en', 'zh-CN', 'ms']) {
      const localeSource = source(`app/i18n/locales/${locale}/admin.json`);
      expect(localeSource).toContain('"inviteStatusSyncFailed"');
    }
  });
});
