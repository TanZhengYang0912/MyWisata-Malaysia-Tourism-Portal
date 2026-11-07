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

  it('passes the actual recipient into drafts and resolves language without replacing edits', () => {
    const modalSource = source('components/admin/ai-draft-email-modal.tsx');
    expect(modalSource).toContain('runDraft(initialEmail)');
    expect(modalSource).toContain('email: recipient.trim()');
    expect(modalSource).toContain('localeOnly: true');
    expect(modalSource).toContain('email.draft.recipientLanguage');
    const lookup = modalSource.slice(modalSource.indexOf('async function resolveRecipientLanguage'), modalSource.indexOf('async function runDraft'));
    expect(lookup).not.toContain('setSubject(');
    expect(lookup).not.toContain('setBody(');
    expect(lookup).toContain('recipientRef.current');
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

  it('bounds the email editor to the dynamic viewport and keeps its actions reachable', () => {
    const modalSource = source('components/admin/ai-draft-email-modal.tsx');

    expect(modalSource).toContain('max-h-[calc(100dvh-2rem)]');
    expect(modalSource).toContain('overflow-y-auto overscroll-contain');
    expect(modalSource).toContain('break-words text-base font-semibold text-foreground');
    expect(modalSource).toContain('flex flex-col gap-2 sm:flex-row sm:justify-end');
  });
});
