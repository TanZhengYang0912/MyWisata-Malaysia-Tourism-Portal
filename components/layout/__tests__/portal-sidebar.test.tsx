import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Package } from "lucide-react";
import { PortalSidebar, type PortalSidebarSection } from "@/components/layout/portal-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vendor/products",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("PortalSidebar", () => {
  it("renders the shared brand, grouped navigation, active state, and pending count accessibly", () => {
    const sections: PortalSidebarSection[] = [
      {
        label: "Operations",
        items: [
          { href: "/vendor/products", label: "Products", icon: Package },
          { href: "/vendor/orders", label: "Orders", icon: Package, count: 3, countLabel: "3 pending orders" },
        ],
      },
    ];

    const markup = renderToStaticMarkup(
      <PortalSidebar
        portalName="Vendor Portal"
        brandName="Malaysia Tourism"
        navigationLabel="Portal navigation"
        contextLabel="Outlet Manager"
        contextDetail="Baba House"
        sections={sections}
      />,
    );

    expect(markup).toContain("Vendor Portal");
    expect(markup).toContain("Malaysia Tourism");
    expect(markup).toContain("Outlet Manager");
    expect(markup).toContain("Baba House");
    expect(markup).toContain("Operations");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="3 pending orders"');
    expect(markup).toContain("focus-visible:ring-2");
  });

  it("wraps the full active outlet name instead of truncating it", () => {
    const markup = renderToStaticMarkup(
      <PortalSidebar
        portalName="Vendor Portal"
        brandName="Malaysia Tourism"
        navigationLabel="Portal navigation"
        contextLabel="Outlet Manager"
        contextDetail="Heritage Hotel Cameron Highlands"
        sections={[]}
      />,
    );

    expect(markup).toContain('class="mt-0.5 whitespace-normal break-words text-xs text-slate-400">Heritage Hotel Cameron Highlands</p>');
  });
});
