import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const locales = ['en', 'ms', 'zh-CN'] as const;
const removedAdminKeys = [
  'dashboard.description',
  'chatbot.topUnanswered.description',
  'chatbot.notHelpful.description',
  'chatbot.topEscalated.description',
  'ui.recommendations.description',
  'ui.recommendations.queueDescription',
  'eventRegistrations.description',
  'eventPromotions.description',
  'announcements.description',
  'staffHelp.description',
  'orderOperations.description',
  'promotionCampaigns.description',
  'promotionCampaigns.form.guidance',
  'rewards.description',
  'sponsoredPlacements.description',
  'ui.vendors.description',
  'ui.vendors.applications.description',
  'ui.platformFees.description',
  'accessControl.policies.compareHint',
  'accessControl.staffEmployees.help',
  'accessControl.staffRoles.rolesHelp',
  'accessControl.staffRoles.assignmentHelp',
  'withdrawals.detail.reviewDescription',
] as const;

const sourceKeys = {
  'app/admin/dashboard/page.tsx': ['dashboard.description'],
  'app/admin/chatbot/page.tsx': [
    'chatbot.topUnanswered.description',
    'chatbot.notHelpful.description',
    'chatbot.topEscalated.description',
  ],
  'app/admin/notifications/page.tsx': ['notifications.adminDescription'],
  'app/admin/announcements/page.tsx': ['announcements.description'],
  'app/admin/event-promotions/page.tsx': ['eventPromotions.description'],
  'app/admin/event-registrations/page.tsx': ['eventRegistrations.description'],
  'app/admin/help/page.tsx': ['staffHelp.description'],
  'app/admin/orders/page.tsx': ['orderOperations.description'],
  'app/admin/promotion-campaigns/page.tsx': [
    'promotionCampaigns.description',
    'promotionCampaigns.form.guidance',
  ],
  'components/admin/access-control/policies-tab.tsx': ['accessControl.policies.compareHint'],
  'components/admin/access-control/staff-employees-panel.tsx': ['accessControl.staffEmployees.help'],
  'components/admin/access-control/staff-roles-tab.tsx': [
    'accessControl.staffRoles.rolesHelp',
    'accessControl.staffRoles.assignmentHelp',
  ],
  'app/admin/recommendations/page.tsx': [
    'ui.recommendations.description',
    'ui.recommendations.queueDescription',
  ],
  'app/admin/rewards/page.tsx': ['rewards.description'],
  'app/admin/sponsored-placements/page.tsx': ['sponsoredPlacements.description'],
  'app/admin/vendors/page.tsx': [
    'ui.vendors.description',
    'ui.vendors.applications.description',
  ],
  'app/admin/vendors/platform-fees/page.tsx': ['ui.platformFees.description'],
  'app/admin/withdrawals/[id]/page.tsx': ['withdrawals.detail.reviewDescription'],
} as const;

const preservedAdminKeys = [
  'hotelAmenities.description',
  'refunds.sandbox.description',
  'eventRegistrations.removeDescription',
  'ui.platformFees.tiers.description',
  'ui.platformFees.events.description',
  'ui.platformFees.confirm.description',
  'ui.walletSettings.confirm.saveDescription',
  'ui.recommendations.rewardClearing.description',
  'ui.vendors.recommendations.description',
  'ui.vendors.eventVendor.description',
  'withdrawals.payoutExecution.lockedDescription',
  'kyc.confirm.identityEvidenceHint',
  'accessControl.staffRoles.assignmentReasonHelp',
] as const;

function readLocale(locale: (typeof locales)[number], namespace: 'admin' | 'common') {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/${namespace}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

describe('Super Admin copy cleanup', () => {
  it('removes redundant fixed descriptions in every supported locale', () => {
    for (const locale of locales) {
      const admin = readLocale(locale, 'admin');
      for (const key of removedAdminKeys) {
        expect(getPath(admin, key), `${locale}: ${key}`).toBeUndefined();
      }

      const common = readLocale(locale, 'common');
      expect(getPath(common, 'notifications.adminDescription'), `${locale}: notifications.adminDescription`).toBeUndefined();
    }

    for (const [relativePath, keys] of Object.entries(sourceKeys)) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      for (const key of keys) {
        expect(source, `${relativePath}: ${key}`).not.toContain(key);
      }
    }
  });

  it('keeps operational, financial, security and action-consequence copy', () => {
    for (const locale of locales) {
      const admin = readLocale(locale, 'admin');
      for (const key of preservedAdminKeys) {
        expect(getPath(admin, key), `${locale}: ${key}`).toEqual(expect.any(String));
      }
    }

    const chatbot = readFileSync(resolve(process.cwd(), 'app/admin/chatbot/page.tsx'), 'utf8');
    expect(chatbot).toContain('chatbot.topUnanswered.title');
    expect(chatbot).toContain('chatbot.notHelpful.title');
    expect(chatbot).toContain('chatbot.topEscalated.title');
    expect(chatbot).toContain('chatbot.topUnanswered.empty');
    expect(chatbot).toContain('chatbot.notHelpful.empty');
    expect(chatbot).toContain('chatbot.topEscalated.empty');
  });
});
