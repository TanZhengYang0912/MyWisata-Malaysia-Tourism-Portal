import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerLayoutSource = readFileSync(
  resolve(process.cwd(), "app/customer/layout.tsx"),
  "utf8",
);
const logoSource = readFileSync(
  resolve(process.cwd(), "components/shared/mylawatan-logo.tsx"),
  "utf8",
);

describe("customer header reference contract", () => {
  it("keeps the shared navigation and a slightly taller primary header row", () => {
    expect(customerLayoutSource).not.toContain('data-customer-header="true"');
    expect(customerLayoutSource).toContain("h-17");
    expect(customerLayoutSource).toContain("max-w-7xl mx-auto");
    expect(customerLayoutSource).toContain("text-sm font-medium");
    expect(customerLayoutSource).toContain("ml-auto flex shrink-0");
    expect(customerLayoutSource).not.toContain("h-[104px]");
    expect(customerLayoutSource).not.toContain("markSize={56}");
    expect(customerLayoutSource.match(/CUSTOMER_NAV\.map/g) ?? []).toHaveLength(2);
    expect(customerLayoutSource).toContain("<item.icon size={16}");
  });

  it("keeps the shared Customer header fixed at the top while routes scroll", () => {
    expect(customerLayoutSource).toMatch(/<nav className="sticky top-0 z-40\b/);
  });

  it("uses the supplied logo asset without changing the header row geometry", () => {
    expect(customerLayoutSource).toContain('src="/branding/mylawatan-logo-transparent.png?v=3"');
    expect(customerLayoutSource).toContain("width={758}");
    expect(customerLayoutSource).toContain("height={306}");
    expect(customerLayoutSource).toContain("h-17");
  });

  it("keeps the logo as one shared, non-shifting lockup", () => {
    expect(logoSource).toContain('data-brand-logo="mylawatan"');
    expect(logoSource).toContain('aria-label={LOGO_BRAND_NAME}');
    expect(logoSource).toContain("gap-4");
  });

  it("closes the header content wrapper before the mobile navigation row", () => {
    expect(customerLayoutSource).toContain(
      "        </div>\n\n        {/* Responsive secondary row",
    );
  });

  it("keeps the latest commit utility visibility rules", () => {
    expect(customerLayoutSource).toContain('className="hidden md:flex w-28"');
    expect(customerLayoutSource).not.toContain('className="hidden md:block"');
    expect(customerLayoutSource).not.toContain("max-md:hidden");
  });

  it("keeps Saved in the account menu and removes mobile-only Saved and Trip shortcuts", () => {
    expect(customerLayoutSource.match(/href="\/customer\/saved"/g) ?? []).toHaveLength(0);
    expect(customerLayoutSource).not.toContain("tripCount");
    expect(customerLayoutSource).not.toContain("/api/trips/count");
    expect(customerLayoutSource).toContain('item.href === "/customer/saved" && savedCount > 0');
    expect(customerLayoutSource).not.toContain("<Bookmark size={13}");
  });

  it("compresses the customer utility row at phone widths to keep account controls visible", () => {
    expect(customerLayoutSource).toContain("px-2 sm:px-6 flex items-center gap-1 sm:gap-8");
    expect(customerLayoutSource).toContain("w-[62px] min-[360px]:w-[84px] min-[420px]:w-[94px] sm:w-[118px]");
    expect(customerLayoutSource).toContain("<CurrencySwitcher compact codeHiddenOnMobile className=\"w-14 min-[360px]:w-16 min-[420px]:w-20 md:w-24\" />");
  });

});
