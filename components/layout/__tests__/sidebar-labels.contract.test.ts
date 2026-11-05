import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Locale = "en" | "ms" | "zh-CN";

const expectedLabels: Record<"vendor" | "admin", Record<Locale, Record<string, string>>> = {
  vendor: {
    en: {
      Products: "Products",
      Bookings: "Bookings",
      Wallet: "Wallet",
      "Business profile": "Profile",
      "Shop page": "Shop",
      Promotions: "Promote Event",
    },
    ms: {
      Products: "Produk",
      Bookings: "Tempahan",
      Wallet: "Dompet",
      "Business profile": "Profil",
      "Shop page": "Kedai",
      Promotions: "Promosi Acara",
    },
    "zh-CN": {
      Products: "产品",
      Bookings: "预订",
      Wallet: "钱包",
      "Business profile": "资料",
      "Shop page": "店铺",
      Promotions: "推广活动",
    },
  },
  admin: {
    en: {
      "Vendor Approvals": "Vendor review",
      "Catalogue Review": "Catalogue",
      "User Management": "Users",
      "KYC Review": "KYC",
      "Wallet Settings": "Wallet",
      "Wallet Approvers": "Approvers",
      "Payout Reports": "Payouts",
      "Support Tickets": "Support",
      "Sponsored Placements": "Sponsored Ads",
      Reconciliation: "Order Breakdown",
      "Promotion Campaigns": "Events",
      "Event Registrations": "Event Stalls",
      "Event Promos": "Event Ads",
    },
    ms: {
      "Vendor Approvals": "Semakan vendor",
      "Catalogue Review": "Katalog",
      "User Management": "Pengguna",
      "KYC Review": "KYC",
      "Wallet Settings": "Dompet",
      "Wallet Approvers": "Pelulus",
      "Payout Reports": "Laporan pembayaran",
      Reconciliation: "Pecahan Pesanan",
      "Support Tickets": "Sokongan",
      "Sponsored Placements": "Iklan Ditaja",
      "Promotion Campaigns": "Acara",
      "Event Registrations": "Gerai Acara",
      "Event Promos": "Iklan Acara",
      "Staff Conduct": "Tatakelakuan",
    },
    "zh-CN": {
      "Vendor Approvals": "商家审核",
      "Catalogue Review": "目录",
      "User Management": "用户",
      "KYC Review": "KYC",
      "Wallet Settings": "钱包",
      "Wallet Approvers": "审批人",
      "Payout Reports": "提现报告",
      "Support Tickets": "支持",
      "Sponsored Placements": "赞助广告",
      Reconciliation: "订单分账",
      "Promotion Campaigns": "活动",
      "Event Registrations": "活动摊位",
      "Event Promos": "活动广告",
    },
  },
};

function readNavigation(portal: "vendor" | "admin", locale: Locale) {
  const file = resolve(process.cwd(), `app/i18n/locales/${locale}/${portal}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as { navigation: Record<string, string> };
}

describe("portal sidebar labels", () => {
  it("uses concise, consistent vendor labels in every supported locale", () => {
    for (const [locale, labels] of Object.entries(expectedLabels.vendor) as [Locale, Record<string, string>][]) {
      const navigation = readNavigation("vendor", locale).navigation;
      for (const [key, expected] of Object.entries(labels)) {
        expect(navigation[key], `${locale} vendor ${key}`).toBe(expected);
      }
    }
  });

  it("uses concise, consistent admin labels in every supported locale", () => {
    for (const [locale, labels] of Object.entries(expectedLabels.admin) as [Locale, Record<string, string>][]) {
      const navigation = readNavigation("admin", locale).navigation;
      for (const [key, expected] of Object.entries(labels)) {
        expect(navigation[key], `${locale} admin ${key}`).toBe(expected);
      }
    }
  });

  it("keeps every portal sidebar label within the readable length budget", () => {
    for (const portal of ["vendor", "admin"] as const) {
      for (const locale of ["en", "ms", "zh-CN"] as Locale[]) {
        const navigation = readNavigation(portal, locale).navigation;
        // Precise Malay finance labels distinguish approval from payout reports.
        const financeLabelLimits: Record<string, number> = { Withdrawals: 21, "Payout Reports": 18 };
        const defaultMaxLength = locale === "zh-CN" ? 8 : 15;
        for (const [key, label] of Object.entries(navigation)) {
          expect(label.length, `${locale} ${portal} ${key}`).toBeLessThanOrEqual(portal === "admin" && locale === "ms" ? financeLabelLimits[key] ?? defaultMaxLength : defaultMaxLength);
        }
      }
    }
  });
});
