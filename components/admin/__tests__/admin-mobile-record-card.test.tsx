import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminMobileRecordCard } from "@/components/admin/admin-mobile-record-card";

describe("AdminMobileRecordCard", () => {
  it("renders the shared regions with a footer only when supplied", () => {
    const withFooter = renderToStaticMarkup(
      <AdminMobileRecordCard
        header={<span>Catalogue item</span>}
        footer={<button type="button">Approve</button>}
      >
        <p>Penang Road Famous Teochew Chendul</p>
      </AdminMobileRecordCard>,
    );

    expect(withFooter).toContain("<article");
    expect(withFooter).toContain("min-w-0 rounded-2xl border border-border bg-card");
    expect(withFooter).toContain("data-admin-mobile-record-card-header");
    expect(withFooter).toContain("data-admin-mobile-record-card-content");
    expect(withFooter).toContain("data-admin-mobile-record-card-footer");
    expect(withFooter).toContain("Catalogue item");
    expect(withFooter).toContain("Penang Road Famous Teochew Chendul");
    expect(withFooter).toContain("Approve");

    const withoutFooter = renderToStaticMarkup(
      <AdminMobileRecordCard header={<span>Vendor application</span>}>
        <p>Malaysia Tourism</p>
      </AdminMobileRecordCard>,
    );
    expect(withoutFooter).not.toContain("data-admin-mobile-record-card-footer");
  });
});
