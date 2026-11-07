import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const locales = ['en', 'ms', 'zh-CN'] as const;
const removedCopyKeys = [
  'ui.dashboard.assignedOutletMoving',
  'ui.dashboard.happeningWith',
  'ui.dashboard.keepExperiencesCurrent',
  'strictMigration.dashboardTodayForVendor',
  'ui.analytics.description',
  'ui.analytics.insightLabel',
  'ui.analytics.insightTitle',
  'ui.analytics.insightDescription',
  'ui.analytics.actionQueue.description',
  'ui.analytics.insights.topProductDescription',
  'ui.analytics.insights.peakWindowDescription',
  'ui.analytics.insights.outletConcentrationDescription',
  'ui.analytics.marketingAttribution.description',
  'ui.inbox.description',
  'ui.announcements.description',
  'ui.outlets.description',
  'ui.products.description',
  'ui.profile.description',
  'ui.wallet.description',
  'ui.wallet.needMore',
  'ui.wallet.needMoreDescription',
  'ui.vouchers.performanceDescription',
  'ui.vouchers.description',
  'ui.redemptions.description',
  'ui.eventOrders.description',
  'ui.bookings.description',
  'ui.orders.description',
  'ui.scanner.description',
  'ui.events.description',
  'ui.eventPromotions.description',
  'productDetails.overviewHint',
  'ui.profile.businessIdentityDescription',
  'ui.profile.businessNameHelp',
  'ui.profile.businessTypeHelp',
  'ui.profile.descriptionHelp',
  'ui.profile.descriptionPlaceholder',
  'ui.profile.brandAssetsDescription',
  'ui.profile.galleryDescription',
  'ui.profile.galleryEmptyDescription',
  'ui.profile.publicProfileLinkDescription',
  'ui.profile.businessDescriptionFallback',
  'ui.profile.updateLocationDescription',
  'assistant.reviewHint',
  'ui.analytics.revenueQuality.description',
  'ui.analytics.bookingMix.description',
  'ui.analytics.demandHeatmap.description',
  'ui.analytics.productPortfolio.description',
  'ui.analytics.outletPerformance.description',
  'ui.analytics.customerSignal.description',
  'ui.analytics.revenueQuality.trendHint',
  'ui.orders.advancedFiltersDescription',
  'taxonomy.productTypes.hint',
  'taxonomy.outletBadges.hint',
  'taxonomy.accommodationTypes.hint',
  'outletForm.accessibilityHint',
  'productForm.availabilityHint',
  'productDetails.pricingHint',
  'productDetails.variantsHint',
  'shopPreview.subtitle',
  'shopPreview.rendererHint',
  'builder.studioHint',
  'builder.currentDraftHint',
  'builder.currentPublishedHint',
  'builder.palette.groups.common-content.hint',
  'builder.palette.groups.products-sales.hint',
  'builder.palette.groups.outlet-information.hint',
  'builder.palette.groups.trust-reviews.hint',
  'builder.palette.items.text.hint',
  'builder.palette.items.image_text.hint',
  'builder.palette.items.product_grid.hint',
  'builder.palette.items.gallery.hint',
  'builder.palette.items.hours.hint',
  'builder.palette.items.contact.hint',
  'builder.palette.items.voucher_banner.hint',
  'builder.palette.items.review_highlight.hint',
  'builder.palette.items.social_proof.hint',
  'builder.palette.items.cta.hint',
  'ui.wallet.transactionDescription',
  'ranking.insight',
  'ranking.selling.insight',
  'ranking.selling.emptyInsight',
  'ranking.rated.insight',
  'ranking.rated.emptyInsight',
];

const affectedSources = [
  'app/vendor/dashboard/page.tsx',
  'app/vendor/inbox/page.tsx',
  'app/vendor/announcements/page.tsx',
  'app/vendor/outlets/page.tsx',
  'app/vendor/products/page.tsx',
  'app/vendor/profile/page.tsx',
  'app/vendor/wallet/page.tsx',
  'app/vendor/vouchers/page.tsx',
  'app/vendor/redemptions/page.tsx',
  'app/vendor/event-orders/page.tsx',
  'app/vendor/bookings/page.tsx',
  'app/vendor/orders/page.tsx',
  'app/vendor/events/page.tsx',
  'app/vendor/events/[id]/page.tsx',
  'app/vendor/event-promotions/page.tsx',
  'components/vendor/product-details-page.tsx',
  'components/vendor/redemption-scanner.tsx',
  'components/vendor/vendor-profile-gallery-manager.tsx',
  'components/vendor/ai-writing-assistant.tsx',
  'components/vendor/outlet-form.tsx',
  'components/vendor/product-form.tsx',
  'components/vendor/product-type-selector.tsx',
  'components/vendor/outlet-shop-preview.tsx',
  'components/vendor/outlet-page-builder.tsx',
  'components/vendor/outlet-builder-palette.tsx',
  'components/vendor/vendor-analytics-workspace.tsx',
  'components/vendor/performance-ranking-card.tsx',
  'lib/vendor/analytics.ts',
];

function readLocale(locale: (typeof locales)[number]) {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/vendor.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

describe('vendor portal copy cleanup', () => {
  it('removes redundant account descriptions in every locale', () => {
    for (const locale of locales) {
      const translations = readLocale(locale);
      for (const key of removedCopyKeys) {
        expect(getPath(translations, key), `${locale}: ${key}`).toBeUndefined();
      }
    }

    for (const relativePath of affectedSources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      for (const key of removedCopyKeys) {
        expect(source, `${relativePath}: ${key}`).not.toMatch(
          new RegExp(`${key.replaceAll('.', '\\.')}['\"]`),
        );
      }
    }
  });

  it('keeps operational copy, analytics values, and the reviewed AI writing assistant', () => {
    for (const locale of locales) {
      const translations = readLocale(locale);
      for (const key of [
        'ui.dashboard.title',
        'ui.wallet.manageProducts',
        'ui.announcements.markSelectedRead',
        'ui.analytics.metrics.averageOrderValue',
        'ui.analytics.metrics.bookingShare',
        'ui.analytics.metrics.averageRating',
        'ui.analytics.metrics.reviewCount',
        'ui.analytics.dataNote.description',
        'ui.analytics.empty.insights',
        'ui.bookings.weeklyHoursDescription',
        'ui.events.locations.description',
        'ui.profile.galleryHelp',
        'ui.profile.slugHelp',
        'ui.profile.galleryClearDescription',
        'ui.profile.statusDescriptions.pending',
        'ui.analytics.dataNote.description',
        'ui.dashboard.salesProvenanceDescription',
        'productForm.stockSetupHint',
        'productForm.variantStockHint',
        'builder.palette.hint',
        'builder.canvasHint',
        'ranking.selling.sold',
        'ranking.rated.reviews',
      ]) {
        expect(getPath(translations, key), `${locale}: ${key}`).toEqual(expect.any(String));
      }
    }

    const analytics = readFileSync(
      resolve(process.cwd(), 'components/vendor/vendor-analytics-workspace.tsx'),
      'utf8',
    );
    const profile = readFileSync(resolve(process.cwd(), 'app/vendor/profile/page.tsx'), 'utf8');
    const inbox = readFileSync(resolve(process.cwd(), 'app/vendor/inbox/page.tsx'), 'utf8');
    const wallet = readFileSync(resolve(process.cwd(), 'app/vendor/wallet/page.tsx'), 'utf8');
    const aiAssistant = readFileSync(resolve(process.cwd(), 'components/vendor/ai-writing-assistant.tsx'), 'utf8');
    expect(analytics).toContain('<MetricCard');
    expect(analytics).toContain('data.metrics.revenuePerOutlet');
    expect(profile).toContain('<AiWritingAssistant');
    expect(inbox).toContain('aiReplyDraft');
    expect(aiAssistant).toContain('assistant.title');
    expect(aiAssistant).not.toContain('assistant.reviewHint');
    expect(wallet).toContain('href="/vendor/products"');
    expect(wallet).toContain("t('ui.wallet.manageProducts')");
  });
});
