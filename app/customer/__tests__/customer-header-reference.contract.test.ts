import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerLayoutSource = readFileSync(
  resolve(process.cwd(), "app/customer/layout.tsx"),
  "utf8",
);
const logoSource = readFileSync(
  resolve(process.cwd(), "components/shared/mywisata-logo.tsx"),
  "utf8",
);

describe("customer header reference contract", () => {
  it("keeps the compact header composition from the latest commit", () => {
    expect(customerLayoutSource).not.toContain('data-customer-header="true"');
    expect(customerLayoutSource).toContain("h-16");
    expect(customerLayoutSource).toContain("max-w-7xl mx-auto");
    expect(customerLayoutSource).toContain("text-sm font-medium");
    expect(customerLayoutSource).toContain("ml-auto flex shrink-0");
    expect(customerLayoutSource).not.toContain("h-[104px]");
    expect(customerLayoutSource).not.toContain("markSize={56}");
  });

  it("uses the supplied logo asset without changing the header row geometry", () => {
    expect(customerLayoutSource).toContain('src="/branding/mywisata-logo-transparent.png?v=2"');
    expect(customerLayoutSource).toContain("width={758}");
    expect(customerLayoutSource).toContain("height={306}");
    expect(customerLayoutSource).toContain("h-16");
  });

  it("keeps the logo as one shared, non-shifting lockup", () => {
    expect(logoSource).toContain('data-brand-logo="mylawatan"');
    expect(logoSource).toContain('aria-label={LOGO_BRAND_NAME}');
    expect(logoSource).toContain("gap-4");
  });

  it("closes the header content wrapper before the mobile navigation row", () => {
    expect(customerLayoutSource).toContain(
      "        </div>\n\n        {/* Mobile bottom-ish secondary row",
    );
  });

  it("keeps the latest commit utility visibility rules", () => {
    expect(customerLayoutSource).toContain('className="hidden md:flex w-28"');
    expect(customerLayoutSource).not.toContain('className="hidden md:block"');
    expect(customerLayoutSource).not.toContain("max-md:hidden");
  });
});
