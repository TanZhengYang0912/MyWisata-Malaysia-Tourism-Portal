import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/vendor/outlets/page.tsx"), "utf8");
const previewSource = readFileSync(resolve(process.cwd(), "components/vendor/outlet-shop-preview.tsx"), "utf8");
const actionSource = readFileSync(resolve(process.cwd(), "components/vendor/outlet-action-group.tsx"), "utf8");

describe("vendor outlets management affordances", () => {
  it("keeps page selection in the result summary row", () => {
    expect(source).toContain("aria-label={t('ui.outlets.selectCurrentPage')}");
    expect(source).toContain("t('ui.outlets.selectCurrentPage')");
    expect(source).not.toContain("Select current page");
  });

  it("makes outlet actions and empty listing states explicit", () => {
    expect(source).toContain("t('ui.outlets.viewDetails')");
    expect(source).toContain("t('ui.outlets.editOutlet')");
    expect(source).toContain("t('ui.outlets.noListings')");
    expect(source).toContain("t('ui.outlets.manageListings')");
    expect(source).toContain("t('ui.outlets.createVoucher')");
    expect(source).toContain("/vendor/vouchers?create=1&outletId=");
    expect(source).toContain("onCreateVoucher");
    expect(previewSource).toContain("TicketPercent");
    expect(previewSource).toContain("onCreateVoucher");
  });

  it("only renders pagination when there is more than one page", () => {
    expect(source).toContain("pagination.totalPages > 1");
  });

  it("centers outlet details as a modal instead of a right-side drawer", () => {
    expect(source).toContain(
      "import CenteredDetailModal from '@/components/ui/centered-detail-modal';",
    );
    expect(source).not.toContain("absolute right-0 top-0");
    expect(source).not.toContain("<style jsx global>");
  });

  it("uses the reusable outlet action group for card and modal actions", () => {
    expect(source).toContain("import OutletActionGroup from '@/components/vendor/outlet-action-group';");
    expect(source).toContain("<OutletActionGroup");
    expect(source).toContain("variant: 'primary'");
    expect(source).toContain("variant: 'secondary'");
    expect(source).toContain("variant: 'destructive'");
    expect(actionSource).toContain("export type OutletAction");
    expect(actionSource).toContain("variant: 'primary' | 'secondary' | 'tertiary' | 'destructive'");
    expect(actionSource).toContain("aria-label={ariaLabel}");
  });

  it("uses the custom confirmation dialog for closing an outlet", () => {
    expect(source).toContain("import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';");
    expect(source).toContain("pendingCloseOutlet");
    expect(source).toContain("<ActionConfirmationDialog");
    expect(source).not.toContain("confirm(t('ui.outlets.closeConfirm'))");
    expect(source).not.toContain("window.confirm");
  });

  it("only exposes shop page editing to outlet managers", () => {
    expect(source).toContain("id: 'edit-shop-page'");
    expect(source).toContain(": isOutletManager");
    expect(source).toContain("builderOutlet && vendorId && isOutletManager");
    expect(source).toContain("id: 'edit-outlet'");
  });

  it("uses precise outlet detail labels and separates the destructive action", () => {
    expect(source).toContain("t('ui.outlets.closeOutlet')");
    expect(source).toContain("t('ui.outlets.getDirections')");
    expect(source).toContain("t('ui.outlets.listedProducts')");
    expect(source).toContain("t('ui.outlets.contactDetails')");
    expect(actionSource).toContain("layout === 'detail' && variant === 'destructive' ? 'sm:col-span-2' : ''");
  });
});
