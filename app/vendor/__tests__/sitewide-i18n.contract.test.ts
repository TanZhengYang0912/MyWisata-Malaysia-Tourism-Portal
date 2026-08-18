import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

/** The checked-in Task 8 scope. Keep this list in lockstep with task-8-brief.md. */
export const VENDOR_I18N_FILES = [
  "app/vendor/analytics/page.tsx",
  "app/vendor/bookings/page.tsx",
  "app/vendor/dashboard/page.tsx",
  "app/vendor/inbox/page.tsx",
  "app/vendor/listings/page.tsx",
  "app/vendor/notifications/page.tsx",
  "app/vendor/orders/page.tsx",
  "app/vendor/outlets/page.tsx",
  "app/vendor/products/page.tsx",
  "app/vendor/profile/page.tsx",
  "app/vendor/register/page.tsx",
  "app/vendor/vouchers/page.tsx",
  "app/vendor/wallet/page.tsx",
  "components/layout/vendor-access-gate.tsx",
  "components/layout/vendor-header.tsx",
  "components/vendor/action-confirmation-dialog.tsx",
  "components/vendor/address-autocomplete.tsx",
  "components/vendor/ai-writing-assistant.tsx",
  "components/vendor/batch-action-bar.tsx",
  "components/vendor/compact-thumbnail.tsx",
  "components/vendor/dashboard-filter.tsx",
  "components/vendor/dashboard-realtime.tsx",
  "components/vendor/order-quick-action.tsx",
  "components/vendor/outlet-builder-canvas.tsx",
  "components/vendor/outlet-builder-editing.ts",
  "components/vendor/outlet-builder-history.ts",
  "components/vendor/outlet-builder-inspector.tsx",
  "components/vendor/outlet-builder-palette.tsx",
  "components/vendor/outlet-builder-ui.ts",
  "components/vendor/outlet-form.tsx",
  "components/vendor/outlet-manager-panel.tsx",
  "components/vendor/outlet-page-builder.tsx",
  "components/vendor/outlet-pie-chart.tsx",
  "components/vendor/outlet-shop-preview.tsx",
  "components/vendor/performance-ranking-card.tsx",
  "components/vendor/price-rule-manager.tsx",
  "components/vendor/product-details-page.tsx",
  "components/vendor/product-form.tsx",
  "components/vendor/product-media-uploader.tsx",
  "components/vendor/recent-transactions.tsx",
  "components/vendor/sales-chart.tsx",
  "components/vendor/slot-form.tsx",
  "components/vendor/variant-manager.tsx",
  "components/vendor/vendor-claim-form.tsx",
  "components/vendor/vendor-share-analytics.tsx",
  "components/vendor/voucher-csv-builder.tsx",
  "components/vendor/voucher-form.tsx",
  "components/shared/affiliate-funnel.tsx",
  "components/shared/affiliate-insight-card.tsx",
  "components/shared/affiliate-rank-card.tsx",
  "components/shared/fraud-breakdown-charts.tsx",
  "components/shared/fraud-trend-chart.tsx",
] as const;

const priorTaskFiles = new Set([
  "app/vendor/layout.tsx",
  "components/layout/vendor-sidebar.tsx",
  "components/vendor/compact-filter-bar.tsx",
  "components/vendor/pagination-controls.tsx",
  "components/vendor/register-vendor-form.tsx",
  "components/vendor/vendor-invite-account-step.tsx",
  "components/vendor/vendor-invite-client.tsx",
  "components/vendor/vendor-invite-details-step.tsx",
  "components/vendor/vendor-invite-phone-state.ts",
  "components/vendor/vendor-invite-phone-step.tsx",
  "components/vendor/vendor-invite-wizard-state.ts",
  "components/vendor/vendor-invite-wizard.tsx",
  "components/shared/action-feedback.tsx",
  "components/shared/affiliate-qr-code.tsx",
  "components/shared/chatbot-widget.tsx",
  "components/shared/empty-state.tsx",
  "components/shared/header-icon-button.ts",
  "components/shared/language-switcher.tsx",
  "components/shared/notification-bell.tsx",
  "components/shared/notification-center.tsx",
  "components/shared/resilient-image.tsx",
  "components/shared/share-button.tsx",
  "components/shared/status-badge.tsx",
  "components/shared/ticket-thread.tsx",
  "components/shared/verified-contributor-badge.tsx",
]);

const pureHelperFiles = new Set([
  "components/layout/vendor-access-gate.tsx",
  "components/vendor/dashboard-realtime.tsx",
  "components/vendor/outlet-builder-editing.ts",
  "components/vendor/outlet-builder-history.ts",
  "components/vendor/outlet-builder-ui.ts",
]);

function actualRenderedInventory(): string[] {
  const roots = ["app/vendor", "components/vendor", "components/layout", "components/shared"];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") visit(path);
      } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  roots.forEach(visit);
  return files.sort();
}

function hasTranslationBinding(source: string): boolean {
  return /useTranslation\(["'](?:vendor|common)["']\)|getServerTranslation\(["'](?:vendor|common)["']\)/.test(source);
}

function callsBoundTranslator(source: string): boolean {
  const bindings = [...source.matchAll(/\{\s*t(?:\s*:\s*([A-Za-z_$][\w$]*))?[^}]*\}\s*=\s*(?:await\s+)?(?:useTranslation|getServerTranslation)\(/g)]
    .map((match) => match[1] ?? "t");
  return bindings.some((binding) => new RegExp(`\\b${binding}\\s*\\(`).test(source));
}

function resourceValue(resource: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, resource);
}

describe("vendor and outlet sitewide i18n contract", () => {
  it("reconciles the exact Task 8 list with the rendered source inventory", () => {
    const actual = new Set(actualRenderedInventory());
    const listed = new Set<string>(VENDOR_I18N_FILES);

    for (const file of VENDOR_I18N_FILES) {
      expect(actual.has(file), `Task 8 file is missing from the rendered inventory: ${file}`).toBe(true);
      expect(() => read(file), file).not.toThrow();
    }
    for (const file of actual) {
      expect(listed.has(file) || priorTaskFiles.has(file), `Unclassified vendor source file: ${file}`).toBe(true);
    }
  });

  it.each(VENDOR_I18N_FILES)("uses a live translation call in %s", (file) => {
    if (pureHelperFiles.has(file)) return;
    const source = read(file);
    expect(hasTranslationBinding(source), `${file} must bind vendor/common translations`).toBe(true);
    expect(callsBoundTranslator(source), `${file} must call its bound translator; a hook alone is insufficient`).toBe(true);
  });

  it("keeps representative vendor semantics dedicated and complete in all locales", () => {
    const resources = {
      en: JSON.parse(read("app/i18n/locales/en/vendor.json")),
      "zh-CN": JSON.parse(read("app/i18n/locales/zh-CN/vendor.json")),
      ms: JSON.parse(read("app/i18n/locales/ms/vendor.json")),
    } as const;
    const expected = {
      en: {
        "ui.dashboard.title": "Vendor dashboard",
        "ui.outlets.empty": "No outlets found",
        "ui.wallet.availableBalance": "Available balance",
        "ui.actions.save": "Save",
      },
      "zh-CN": {
        "ui.dashboard.title": "商家仪表板",
        "ui.outlets.empty": "未找到门店",
        "ui.wallet.availableBalance": "可用余额",
        "ui.actions.save": "保存",
      },
      ms: {
        "ui.dashboard.title": "Papan pemuka vendor",
        "ui.outlets.empty": "Tiada outlet ditemui",
        "ui.wallet.availableBalance": "Baki tersedia",
        "ui.actions.save": "Simpan",
      },
    } as const;

    for (const [locale, values] of Object.entries(expected)) {
      for (const [key, value] of Object.entries(values)) {
        expect(resourceValue(resources[locale as keyof typeof resources], key), `${locale}:${key}`).toBe(value);
      }
    }
  });

  it("covers high-risk vendor clusters with the vendor namespace", () => {
    for (const file of [
      "app/vendor/dashboard/page.tsx",
      "app/vendor/analytics/page.tsx",
      "app/vendor/outlets/page.tsx",
      "app/vendor/products/page.tsx",
      "app/vendor/vouchers/page.tsx",
      "app/vendor/wallet/page.tsx",
      "components/vendor/outlet-page-builder.tsx",
      "components/vendor/product-form.tsx",
      "components/vendor/voucher-form.tsx",
    ]) {
      expect(read(file), file).toMatch(/(?:useTranslation|getServerTranslation)\(["']vendor["']/);
    }
  });

  it("translates route-owned high-risk controls instead of only binding a hook", () => {
    const expectations: Record<string, { keys: string[]; oldCopy: string[] }> = {
      "app/vendor/bookings/page.tsx": {
        keys: ["ui.bookings.searchPlaceholder", "ui.bookings.selectCurrentPage", "ui.bookings.reservationDetails"],
        oldCopy: ["Search booking ID, guest or experience", "Select current page", "Reservation details"],
      },
      "app/vendor/inbox/page.tsx": {
        keys: ["ui.inbox.traveller", "ui.inbox.noMessages", "ui.inbox.lastMessage"],
        oldCopy: ["No messages yet", "Your last message"],
      },
      "app/vendor/orders/page.tsx": {
        keys: ["ui.orders.customerColumn", "ui.orders.selectCurrentPage", "ui.orders.orderDetails"],
        oldCopy: ["Select current page", "Order details", "Overall Fulfilment"],
      },
      "app/vendor/outlets/page.tsx": {
        keys: ["ui.outlets.searchPlaceholder", "ui.outlets.selectCurrentPage", "ui.outlets.outletDetails"],
        oldCopy: ["Search outlet ID, name or city", "Select current page", "Outlet details"],
      },
      "app/vendor/products/page.tsx": {
        keys: ["ui.products.searchPlaceholder", "ui.products.selectCurrentPage", "ui.products.noMatches"],
        oldCopy: ["Search product ID, name or slug", "Select current page", "No listings match these filters"],
      },
      "app/vendor/profile/page.tsx": {
        keys: ["ui.profile.unsavedChanges", "ui.profile.businessIdentity", "ui.profile.livePreview"],
        oldCopy: ["Unsaved changes", "These details appear on your public vendor profile", "Live preview"],
      },
      "app/vendor/vouchers/page.tsx": {
        keys: ["ui.vouchers.uploadCsv", "ui.vouchers.performance", "ui.vouchers.closeDetails"],
        oldCopy: ["Upload voucher CSV", "Voucher performance", "Close voucher details"],
      },
      "app/vendor/wallet/page.tsx": {
        keys: ["ui.wallet.summaryLabel", "ui.wallet.transactionHistory", "ui.wallet.submitRequest"],
        oldCopy: ["Wallet summary", "Transaction history", "Submit request"],
      },
    };

    for (const [file, expectation] of Object.entries(expectations)) {
      const source = read(file);
      for (const key of expectation.keys) {
        expect(source, `${file} must call ${key}`).toContain(`t('${key}')`);
      }
      for (const oldCopy of expectation.oldCopy) {
        expect(source, `${file} still contains fixed English: ${oldCopy}`).not.toContain(oldCopy);
      }
    }
  });

  it("removes confirmed fixed English fallbacks from corrected vendor surfaces", () => {
    const expectations: Record<string, { keys: string[]; oldCopy: string[] }> = {
      "app/vendor/products/page.tsx": {
        keys: ["ui.products.loadFailed", "ui.products.archiveConfirm", "ui.products.archiveFailed", "ui.products.archived", "ui.products.batchSummarySkipped", "ui.products.batchSummary"],
        oldCopy: [
          "Could not load products",
          "Archive this listing? It will no longer be visible to customers.",
          "Could not archive listing",
          "Product archived successfully.",
          "Could not archive listing. Please try again.",
          " updated, ",
          " skipped by status.",
          " listings updated.",
        ],
      },
      "app/vendor/outlets/page.tsx": {
        keys: ["ui.outlets.loadFailed", "ui.outlets.selectOutlet"],
        oldCopy: ["Could not load outlets", "Select "],
      },
      "app/vendor/vouchers/page.tsx": {
        keys: [
          "ui.vouchers.loadFailed",
          "ui.vouchers.updateFailed",
          "ui.vouchers.activated",
          "ui.vouchers.copyFailed",
          "ui.vouchers.uploadFailed",
          "ui.vouchers.batchTryAgain",
        ],
        oldCopy: [
          "Could not load vouchers",
          "Could not load voucher analytics",
          "Could not update voucher",
          "Voucher deactivated.",
          "Voucher activated.",
          "Could not copy the voucher code.",
          "Could not load saved CSV drafts",
          "Could not save CSV draft",
          "Could not discard CSV draft",
          "CSV upload failed",
          "Voucher upload succeeded, but the saved draft could not be cleared.",
          "Batch action failed. Please try again.",
        ],
      },
      "app/vendor/profile/page.tsx": {
        keys: ["ui.profile.loadFailed", "ui.profile.aiUnavailable", "ui.profile.saved", "ui.profile.saveFailed", "ui.profile.profileLinkCopied"],
        oldCopy: [
          "Unable to load vendor profile",
          "AI writing is unavailable.",
          "Saved just now",
          "Unable to save vendor profile",
          "Public profile link copied",
        ],
      },
      "app/vendor/inbox/page.tsx": {
        keys: ["ui.inbox.filter.needs_reply"],
        oldCopy: ["Needs your reply"],
      },
      "components/vendor/product-form.tsx": {
        keys: ["productForm.categoryInvalid", "productForm.capacityPlaceholder", "productForm.galleryImageAlt", "productForm.removeGalleryImage"],
        oldCopy: ["Please choose a valid category.", "e.g. 12", "Gallery image ", "Remove gallery image "],
      },
      "components/vendor/outlet-manager-panel.tsx": {
        keys: ["outletManager.emailPlaceholder"],
        oldCopy: ["manager@example.com"],
      },
      "components/vendor/outlet-form.tsx": {
        keys: ["outletForm.emailPlaceholder"],
        oldCopy: ["branch@example.com"],
      },
      "components/vendor/voucher-csv-builder.tsx": {
        keys: ["voucher.csv.autosaveNotice"],
        oldCopy: ["Changes save after 8 seconds of inactivity"],
      },
      "components/vendor/outlet-builder-inspector.tsx": {
        keys: ["builder.inspector.buttonLink"],
        oldCopy: ["Button link"],
      },
    };

    for (const [file, expectation] of Object.entries(expectations)) {
      const source = read(file);
      for (const key of expectation.keys) {
        expect(source, `${file} must call ${key}`).toContain(key);
      }
      for (const oldCopy of expectation.oldCopy) {
        expect(source, `${file} still contains fixed English: ${oldCopy}`).not.toContain(oldCopy);
      }
    }

    const resources = {
      en: JSON.parse(read("app/i18n/locales/en/vendor.json")),
      "zh-CN": JSON.parse(read("app/i18n/locales/zh-CN/vendor.json")),
      ms: JSON.parse(read("app/i18n/locales/ms/vendor.json")),
    } as const;
    const requiredKeys = Object.values(expectations).flatMap(({ keys }) => keys);

    for (const [locale, resource] of Object.entries(resources)) {
      for (const key of requiredKeys) {
        expect(resourceValue(resource, key), `${locale}:${key}`).toEqual(expect.any(String));
      }
    }
  });
});
