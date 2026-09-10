import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

export const CUSTOMER_I18N_FILES = [
  "app/customer/activity/[id]/activity-detail-client.tsx",
  "app/customer/activity/[id]/bodies/activity-body.tsx",
  "app/customer/activity/[id]/bodies/booking-panel.tsx",
  "app/customer/activity/[id]/bodies/food-body.tsx",
  "app/customer/activity/[id]/bodies/retail-body.tsx",
  "app/customer/activity/[id]/bodies/stay-body.tsx",
  "app/customer/activity/[id]/loading.tsx",
  "app/customer/activity/[id]/page.tsx",
  "app/customer/activity/page.tsx",
  "app/customer/affiliate/page.tsx",
  "app/customer/bookings/[id]/page.tsx",
  "app/customer/calendar/page.tsx",
  "app/customer/cart/page.tsx",
  "app/customer/chat/[threadId]/page.tsx",
  "app/customer/chat/page.tsx",
  "app/customer/checkout/page.tsx",
  "app/customer/checkout/simulator/[sessionId]/page.tsx",
  "app/customer/customer-home-client.tsx",
  "app/customer/design-demo/design-demo-client.tsx",
  "app/customer/destination/[destinationId]/page.tsx",
  "app/customer/experience/[experienceId]/experience-booking-sidebar.tsx",
  "app/customer/experience/[experienceId]/page.tsx",
  "app/customer/explore/explore-client.tsx",
  "app/customer/explore/loading.tsx",
  "app/customer/explore/page.tsx",
  "app/customer/for-you/for-you-client.tsx",
  "app/customer/for-you/page.tsx",
  "app/customer/home-client.tsx",
  "app/customer/kyc/page.tsx",
  "app/customer/layout.tsx",
  "app/customer/loading.tsx",
  "app/customer/map/page.tsx",
  "app/customer/notifications/page.tsx",
  "app/customer/orders/[id]/page.tsx",
  "app/customer/orders/page.tsx",
  "app/customer/outlet/[outletId]/page.tsx",
  "app/customer/page.tsx",
  "app/customer/partners/page.tsx",
  "app/customer/place/[slug]/page.tsx",
  "app/customer/phone/page.tsx",
  "app/customer/preferences/page.tsx",
  "app/customer/profile/[userId]/page.tsx",
  "app/customer/profile/page.tsx",
  "app/customer/profile/register-vendor/page.tsx",
  "app/customer/profile/wizard-progress.ts",
  "app/customer/recommendations/[id]/page.tsx",
  "app/customer/recommendations/page.tsx",
  "app/customer/saved/page.tsx",
  "app/customer/search/loading.tsx",
  "app/customer/search/page.tsx",
  "app/customer/search/search-client.tsx",
  "app/customer/support/[id]/page.tsx",
  "app/customer/support/page.tsx",
  "app/customer/trip/[tripId]/page.tsx",
  "app/customer/trip/[tripId]/trip-planner-client.tsx",
  "app/customer/trip/page.tsx",
  "app/customer/trip/trip-hub-client.tsx",
  "app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx",
  "app/customer/vendor/[vendorId]/page.tsx",
  "app/customer/vouchers/page.tsx",
  "app/customer/vouchers/voucher-hub-client.tsx",
  "app/customer/verification/page.tsx",
  "app/customer/wallet/page.tsx",
  "app/customer/wallet/withdrawals/[id]/page.tsx",
  "app/customer/wishlist/page.tsx",
  "app/customer/wishlist/wishlist-client.tsx",
  "app/guest/activity/[id]/page.tsx",
  "app/guest/explore/page.tsx",
  "app/guest/layout.tsx",
  "app/guest/vendor/[vendorId]/page.tsx",
  "components/customer/activity-card.tsx",
  "components/customer/activity-reviews.tsx",
  "components/customer/affiliate-clicks-chart.tsx",
  "components/customer/ai-tag.tsx",
  "components/customer/booking-day-drawer.tsx",
  "components/customer/booking-qr-code.tsx",
  "components/customer/category-icon.tsx",
  "components/customer/chat-thread-panel.tsx",
  "components/customer/customer-capability-gate-dialog.tsx",
  "components/customer/customer-page-shell.tsx",
  "components/customer/destination-preview-modal.tsx",
  "components/customer/directory-pagination.tsx",
  "components/customer/discovery-filters.tsx",
  "components/customer/guest-account-empty-state.tsx",
  "components/customer/malaysia-destination-rail.tsx",
  "components/customer/nearby-outlets.tsx",
  "components/customer/outlet-chat-button.tsx",
  "components/customer/place-admission-section.tsx",
  "components/customer/place-activity-section.tsx",
  "components/customer/place-breadcrumb.tsx",
  "components/customer/place-card.tsx",
  "components/customer/place-community-section.tsx",
  "components/customer/place-list.tsx",
  "components/customer/promotion-spotlight.tsx",
  "components/customer/saved-destination-card.tsx",
  "components/customer/sponsored-partner-rail.tsx",
  "components/customer/use-customer-capability-gate.ts",
  "components/customer/wallet/customer-transaction-history.tsx",
  "components/customer/wallet/payout-readiness.tsx",
  "components/customer/wallet/wallet-balance-summary.tsx",
  "components/customer/wallet/withdrawal-list.tsx",
  "components/guest/guest-catalogue.tsx",
  "components/map/map-view.tsx",
  "components/map/maplibre-map.tsx",
  "components/demo-map/discovery-pin-preview.tsx",
  "components/demo-map/malaysia-district-map.tsx",
  "components/demo-map/malaysia-state-map.tsx",
  "components/demo-map/story-map.tsx",
  "components/outlet/outlet-block-renderer.tsx",
  "components/outlet/outlet-menu.tsx",
  "components/outlet/outlet-page-renderer.tsx",
  "components/profile/preferences-editor.tsx",
  "components/profile/business-share-banner.tsx",
  "components/profile/city-autocomplete.tsx",
  "components/profile/country-combobox.tsx",
  "components/profile/international-phone-input.tsx",
  "components/profile/phone-verification-card.tsx",
  "components/profile/profile-camera-dialog.tsx",
  "components/profile/profile-location-fields.tsx",
  "components/profile/profile-photo-picker.tsx",
  "components/profile/profile-sections.tsx",
  "components/profile/verification-path-cards.tsx",
] as const;

const inventoryRoots = [
  "app/customer",
  "app/guest",
  "components/customer",
  "components/guest",
  "components/map",
  "components/demo-map",
  "components/outlet",
  "components/profile",
] as const;

const typeOnlyFiles = new Set([
  "app/customer/activity/[id]/bodies/index.ts",
  "app/customer/activity/[id]/bodies/types.ts",
  "components/outlet/outlet-block-types.ts",
  "app/customer/trip/actions.ts",
]);

function renderedInventory(): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(resolve(process.cwd(), directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") visit(path);
      } else if (/\.(?:ts|tsx)$/.test(entry.name) && !typeOnlyFiles.has(path)) {
        files.push(path);
      }
    }
  };
  inventoryRoots.forEach(visit);
  return files.sort();
}

function translationBindings(source: string): string[] {
  return [...source.matchAll(/\{\s*t(?:\s*:\s*([A-Za-z_$][\w$]*))?(?:\s*,[^}]*)?\s*\}\s*=\s*(?:await\s+)?(?:useTranslation|getServerTranslation)\(/g)]
    .map((match) => match[1] ?? "t");
}

function resourceValue(resource: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[segment];
  }, resource);
}

const delegatingFiles = new Set([
  // Thin route wrappers delegate their rendered copy to the client/component
  // listed below; keeping them in the inventory protects the route boundary.
  "app/customer/activity/[id]/bodies/food-body.tsx",
  "app/customer/activity/[id]/bodies/retail-body.tsx",
  "app/customer/activity/[id]/loading.tsx",
  "app/customer/activity/[id]/page.tsx",
  "app/customer/activity/page.tsx",
  "app/customer/explore/loading.tsx",
  "app/customer/explore/page.tsx",
  "app/customer/for-you/page.tsx",
  "app/customer/loading.tsx",
  "app/customer/map/page.tsx",
  "app/customer/outlet/[outletId]/page.tsx",
  "app/customer/page.tsx",
  "app/customer/profile/wizard-progress.ts",
  "app/customer/search/loading.tsx",
  "app/customer/search/page.tsx",
  "app/customer/verification/page.tsx",
  "app/guest/activity/[id]/page.tsx",
  "app/guest/explore/page.tsx",
  "app/guest/layout.tsx",
  "app/guest/vendor/[vendorId]/page.tsx",
  "components/customer/ai-tag.tsx",
  "components/customer/category-icon.tsx",
  "components/customer/customer-page-shell.tsx",
  "components/customer/use-customer-capability-gate.ts",
]);

describe("customer and guest sitewide i18n contract", () => {
  it("keeps the checked-in Task 7 rendered inventory explicit", () => {
    expect([...CUSTOMER_I18N_FILES].sort()).toEqual(renderedInventory());
    for (const file of CUSTOMER_I18N_FILES) {
      expect(() => read(file), file).not.toThrow();
    }
  });

  it.each(CUSTOMER_I18N_FILES)("uses the sitewide translation runtime in %s", (file) => {
    const source = read(file);
    if (delegatingFiles.has(file)) return;

    expect(source, file).toMatch(/useTranslation\(|getServerTranslation\(/);
    const bindings = translationBindings(source);
    expect(bindings.length, `${file} must bind the translation function`).toBeGreaterThan(0);
    expect(bindings.some((binding) => new RegExp(`\\b${binding}\\s*\\(`).test(source)), `${file} must call its bound translation function`).toBe(true);
    expect(source, `${file} must not prefix keys with common. when ns is already common`).not.toMatch(/["']common\.[^"']+["']\s*,\s*\{[^}]*ns:\s*["']common["']/);
  });

  it("resolves representative semantic customer keys in every locale", () => {
    const resources = {
      en: JSON.parse(read("app/i18n/locales/en/customer.json")),
      "zh-CN": JSON.parse(read("app/i18n/locales/zh-CN/customer.json")),
      ms: JSON.parse(read("app/i18n/locales/ms/customer.json")),
    } as const;
    const expected = {
      en: { "ui.actions.addToTrip": "Add to trip", "ui.preferencesEditor.saved": "Preferences saved.", "ui.outlet.dropImage": "Drop image here" },
      "zh-CN": { "ui.actions.addToTrip": "加入行程", "ui.preferencesEditor.saved": "偏好已保存。", "ui.outlet.dropImage": "将图片拖放到这里" },
      ms: { "ui.actions.addToTrip": "Tambah ke perjalanan", "ui.preferencesEditor.saved": "Pilihan disimpan.", "ui.outlet.dropImage": "Letakkan imej di sini" },
    } as const;

    for (const [locale, values] of Object.entries(expected)) {
      for (const [key, value] of Object.entries(values)) {
        expect(resourceValue(resources[locale as keyof typeof resources], key), `${locale}:${key}`).toBe(value);
      }
    }
  });

  it("keeps independent verification and honest Profile-or-KYC recovery copy in every locale", () => {
    const resources = [
      {
        resource: JSON.parse(read("app/i18n/locales/en/customer.json")),
        kycGuestDescription: "Sign in before submitting identity documents.",
      },
      {
        resource: JSON.parse(read("app/i18n/locales/zh-CN/customer.json")),
        kycGuestDescription: "提交身份证件前，请先登录。",
      },
      {
        resource: JSON.parse(read("app/i18n/locales/ms/customer.json")),
        kycGuestDescription: "Log masuk sebelum menghantar dokumen identiti.",
      },
    ];

    for (const { resource, kycGuestDescription } of resources) {
      expect(resourceValue(resource, "ui.accountVerification.title")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.accountVerification.intents.checkout.title")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.accountVerification.statuses.phone.title")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.phoneVerification.title")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.capabilityGate.blockers.PROFILE_OR_KYC_REQUIRED.title")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.capabilityGate.blockers.PROFILE_OR_KYC_REQUIRED.description")).toEqual(expect.any(String));
      expect(resourceValue(resource, "ui.kyc.guestDescription")).toBe(kycGuestDescription);
    }
  });

  it("covers high-risk customer and guest surfaces with customer translations", () => {
    for (const file of [
      "app/customer/checkout/page.tsx",
      "app/customer/checkout/simulator/[sessionId]/page.tsx",
      "app/customer/wallet/page.tsx",
      "app/customer/kyc/page.tsx",
      "app/customer/profile/page.tsx",
      "app/customer/support/page.tsx",
      "app/customer/support/[id]/page.tsx",
      "app/customer/bookings/[id]/page.tsx",
      "app/customer/orders/[id]/page.tsx",
      "components/demo-map/story-map.tsx",
      "app/customer/vendor/[vendorId]/page.tsx",
    ]) {
      expect(read(file), file).toMatch(/(?:useTranslation|getServerTranslation)\(["'](?:customer|common)["']/);
    }
  });

  it("keeps corrected high-risk surfaces free of their previous fixed English copy", () => {
    const correctedCopy = [
      ["components/profile/profile-sections.tsx", [">Danger Zone<", ">Send OTP<", 'placeholder="Type DELETE to confirm"']],
      ["app/customer/wallet/page.tsx", ['title="My Wallet"', ">Top Up via Card<", ">Transaction History<"]],
      ["app/customer/wishlist/wishlist-client.tsx", ["Your travel shortlist", "Saved places & experiences", 'aria-label="Saved content"']],
      ["app/customer/wishlist/page.tsx", ["Saved experiences unavailable", "Please try again in a moment."]],
      ["app/customer/orders/page.tsx", ['placeholder="Search order ID, product or outlet"', "No orders match these filters", ">Newest first<"]],
      ["app/customer/calendar/page.tsx", ['placeholder="Search bookings"', 'aria-label="Calendar actions"', ">No bookings match the selected filters.<"]],
      ["app/customer/kyc/page.tsx", ['<option value="passport">Passport</option>', "KYC documents submitted for review."]],
      ["app/customer/recommendations/page.tsx", ['placeholder="Phone"', 'placeholder="Email"', 'placeholder="Website"']],
      ["components/outlet/outlet-menu.tsx", [">Photo coming soon<", ">Featured<", ">From<"]],
      ["components/demo-map/malaysia-state-map.tsx", ["Select a region to explore", 'aria-label="Interactive map of Malaysia showing all states and federal territories"']],
      ["components/demo-map/malaysia-district-map.tsx", ['?? "All states and federal territories"', "> All Malaysia<"]],
      ["components/demo-map/story-map.tsx", [">Good for<", ">Malaysia experiences<", "> Hidden Gem<"]],
    ] as const;

    for (const [file, oldCopies] of correctedCopy) {
      const source = read(file);
      for (const oldCopy of oldCopies) expect(source, `${file}: ${oldCopy}`).not.toContain(oldCopy);
    }
  });
});
