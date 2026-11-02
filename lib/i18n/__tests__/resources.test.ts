import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "../locale";
import { APP_NAMESPACES, loadLocaleResources } from "../resources";

interface TranslationBranch {
  [key: string]: TranslationBranch;
}

type TestResources = Record<(typeof APP_NAMESPACES)[number], TranslationBranch>;

async function loadTestResources(locale: "en" | "zh-CN" | "ms"): Promise<TestResources> {
  return await loadLocaleResources(locale) as unknown as TestResources;
}

function flattenJson(value: unknown, prefix = "", entries = new Map<string, unknown>()): Map<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      flattenJson(nestedValue, prefix ? `${prefix}.${key}` : key, entries);
    }
  } else if (prefix) {
    entries.set(prefix, value);
  }

  return entries;
}

function interpolationVariables(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("translation resources", () => {
  it("keeps every non-English namespace in parity with English", async () => {
    const resources = Object.fromEntries(
      await Promise.all(APP_LOCALES.map(async (locale) => [locale, await loadLocaleResources(locale)] as const)),
    );
    const englishResources = resources.en;

    for (const namespace of APP_NAMESPACES) {
      const englishKeys = [...flattenJson(englishResources[namespace]).keys()].sort();

      for (const locale of APP_LOCALES.filter((candidate) => candidate !== "en")) {
        const localeEntries = flattenJson(resources[locale][namespace]);
        expect([...localeEntries.keys()].sort(), `${locale}/${namespace} key parity`).toEqual(englishKeys);

        for (const [key, value] of localeEntries) {
          if (typeof value === "string") {
            expect(value.trim(), `${locale}/${namespace}/${key} should not be empty`).not.toBe("");
            expect(
              interpolationVariables(value),
              `${locale}/${namespace}/${key} interpolation parity`,
            ).toEqual(interpolationVariables(flattenJson(englishResources[namespace]).get(key)));
          }
        }
      }
    }
  }, 60_000);

  it("distinguishes a recommendation category from referral commission amounts", async () => {
    const [english, chinese, malay] = await Promise.all([
      loadTestResources("en"),
      loadTestResources("zh-CN"),
      loadTestResources("ms"),
    ]);

    expect(english.admin.reconciliation.columns.recommendation).toBe("Referral commission");
    expect(chinese.admin.accessControl.categories.recommendation).toBe("推荐");
    expect(chinese.admin.reconciliation.columns.recommendation).toBe("推荐佣金");
    expect(malay.admin.accessControl.categories.recommendation).toBe("Cadangan");
    expect(malay.admin.reconciliation.columns.recommendation).toBe("Komisen rujukan");
    expect(chinese.admin.accessControl.staffRoles.searchHelp).toContain("员工");
    expect(malay.admin.accessControl.staffRoles.searchHelp).toContain("Kakitangan");
    expect(chinese.admin.kyc.ocr.documentEnding).toContain("证件号码后四位");
    expect(malay.admin.kyc.ocr.documentEnding).toContain("Empat digit terakhir");
    expect(chinese.admin.kyc.operations.continueNext).toContain("下一位申请人");
    expect(malay.admin.kyc.operations.continueNext).toContain("pemohon seterusnya");
  });

  it("keeps translated review and money statuses distinct", async () => {
    const [english, chinese, malay] = await Promise.all([
      loadTestResources("en"),
      loadTestResources("zh-CN"),
      loadTestResources("ms"),
    ]);

    expect(chinese.common.currency.label).toBe("显示货币");
    expect(chinese.common.statuses.onboarding).toBe("入驻中");
    expect(chinese.common.statuses.vendorPendingReview).toBe("商家申请待审核");
    expect(malay.common.statuses.onboarding).toBe("Sedang melengkapkan proses penyertaan");
    expect(malay.common.statuses.vendorPendingReview).toBe("Menunggu semakan permohonan vendor");
    expect(english.common.notifications.events.withdrawalSecondApprovalPending.title).toContain("First withdrawal review completed");
    expect(chinese.common.notifications.events.withdrawalSecondApprovalPending.title).toContain("提现第一步审核已完成");
    expect(malay.common.notifications.events.withdrawalSecondApprovalPending.title).toContain("Semakan pertama pengeluaran selesai");
    expect(chinese.common.notifications.events.withdrawalApproved.title).toContain("提现已批准");
    expect(chinese.auth.guest.label).toBe("游客");
    expect(chinese.auth.staffInvitation.states.role_changed).toContain("此角色已更改");
    expect(malay.auth.staffInvitation.states.revoked).toContain("ditarik balik");
  });

  it("uses the right meaning for customer and vendor financial labels", async () => {
    const [english, chinese, malay] = await Promise.all([
      loadTestResources("en"),
      loadTestResources("zh-CN"),
      loadTestResources("ms"),
    ]);

    expect(english.vendor.ui.bookings.onThisPage).toBe("{{count}} on this page");
    expect(malay.vendor.ui.status.refunded).toBe("Dibayar balik");
    expect(malay.vendor.ui.status.checked_in).toBe("Sudah daftar masuk");
    expect(malay.vendor.voucher.form.onlineCheckout).toBe("Pembayaran dalam talian");
    expect(malay.vendor.transactions.vendorTotal).toBe("Amaun pesanan");
    expect(chinese.vendor.ui.events.adminAllocate).toBe("等待 Admin 分配");
    expect(malay.vendor.ui.redemptions.selfService).toBe("Pembayaran di kaunter");
    expect(malay.vendor.ui.events.withdraw.done).toContain("dibayar balik");
    expect(chinese.vendor.ui.wallet.withdrawals).toBe("提现");
    expect(malay.vendor.affiliate.rank.position).toContain("pengguna afiliasi");
    expect(malay.customer.ui.cart.seatsLeft).toBe("{{count}} tempat lagi");
    expect(malay.customer.strictMigration.affiliate.earnings.reversed).toContain("Pendapatan dibalikkan");
    expect(chinese.customer.strictMigration.affiliate.earnings.reversed).toContain("已冲销");
    expect(chinese.customer.ui.recommendationEarnings.title).toBe("推荐佣金");
    expect(malay.customer.ui.recommendationEarnings.title).toBe("Komisen rujukan");
    expect(malay.customer.ui.affiliate.loadingDashboard).toContain("papan pemuka afiliasi");
    expect(malay.customer.ui.accountVerification.intents.checkout.title).toContain("buat pembayaran");
    expect(malay.customer.ui.phoneVerification.completeDescription).toContain("pembayaran");
    expect(chinese.customer.strictMigration.walletReceipt.payoutReference).toContain("提现参考编号");
    expect(chinese.customer.strictMigration.walletReceipt.guidance.processing.title).toContain("提现");
    expect(malay.customer.strictMigration.walletReceipt.guidance.processing.title).toContain("Pengeluaran");
    expect(chinese.customer.legal.privacy.cookies.body).toContain("将推荐收益归因给正确的人");
    expect(chinese.customer.legal.terms.accounts.body).toContain("游客可直接");
    expect(malay.customer.help.backToExplore).toBe("Kembali meneroka");
    expect(malay.customer.ui.calendar.inMonth).toContain("item jadual perjalanan bulan ini");
    expect(malay.customer.ui.home.swipeDestinations).toContain("negeri dan wilayah persekutuan");
    expect(malay.customer.ui.promotionCampaigns.map.unlocatedCount_other).toContain("wilayah persekutuan");
    expect(chinese.customer.ui.promotionCampaigns.vendorPages).toBe("活动商家列表");
    expect(chinese.customer.ui.map.placesReady).toContain("等你开启下一段");
    expect(malay.customer.ui.labels.trending).toBe("Sedang sohor");
    expect(chinese.customer.ui.labels.publicAccess).toBe("公众开放");
    expect(chinese.customer.ui.tripBudget.viewAlternative).toBe("查看项目");
    expect(chinese.customer.ui.vendor.localPartnerTitle).toBe("马来西亚行程的本地合作伙伴");
    expect(malay.customer.ui.outlet.blockLabels.contact).toBe("Peta dan maklumat hubungan");
  });

  it("keeps Admin money and pickup statuses precise", async () => {
    const [english, chinese, malay] = await Promise.all([
      loadTestResources("en"),
      loadTestResources("zh-CN"),
      loadTestResources("ms"),
    ]);

    expect(chinese.admin.navigation.Withdrawals).toBe("提现审批");
    expect(chinese.admin.navigation["Payout Reports"]).toBe("提现报告");
    expect(chinese.admin.accessControl.staffRoles.assignmentReasonPlaceholder).toContain("提现复核");
    expect(malay.admin.navigation.Withdrawals).toBe("Kelulusan pengeluaran");
    expect(malay.admin.navigation["Payout Reports"]).toBe("Laporan pembayaran");
    expect(malay.admin.withdrawals.status.hold).toBe("Ditahan");
    expect(malay.admin.refunds.status.processed).toBe("Telah diproses");
    expect(malay.admin.reconciliation.description).toContain("komisen afiliasi dan komisen rujukan");
    expect(chinese.admin.dashboard.openApprovals).toBe("查看审批");
    expect(malay.admin.dashboard.openApprovals).toBe("Buka kelulusan");
    expect(chinese.admin.ui.vendors.errors.ownerKycRequired).toContain("负责人必须通过");
    expect(chinese.admin.ui.walletSettings.description).toContain("提现政策");
    expect(malay.admin.ui.walletSettings.description).toContain("polisi pengeluaran");
    expect(malay.admin.ui.recommendations.rewardClearing.title).toBe("Penyelesaian ganjaran cadangan");
    expect(malay.admin.ui.recommendations.rewardClearing.operationDescription).toContain("kitaran penyelesaian");
    expect(malay.admin.moderationWords.confirmDelete).toContain("senarai penapisan automatik");
    expect(chinese.admin.batchActions["fraud-override"]).toBe("覆盖高风险");
    expect(malay.admin.batchActions["fraud-override"]).toBe("Ganti risiko tinggi");
    expect(chinese.admin.filters.open).toBe("未处理");
    expect(malay.admin.moderation.flags.flagsCount).toContain("tanda");
    expect(chinese.admin.eventRegistrations.adminAllocate).toBe("等待 Admin 分配");
    expect(malay.admin.eventRegistrations.removeDescription).toContain("akan dibayar balik");
    expect(malay.admin.eventPromotions.paymentMethods.wallet).toBe("pendapatan dompet");
    expect(english.admin.eventOperations.confirmNoShow).toContain("did not collect the order");
    expect(chinese.admin.eventOperations.confirmNoShow).toContain("未领取");
    expect(malay.admin.eventOperations.confirmNoShow).toContain("tidak mengambil pesanan");
  });
});
