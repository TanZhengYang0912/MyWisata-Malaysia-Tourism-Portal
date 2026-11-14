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
    expect(markup).toContain("text-foreground/80");
    expect(markup).toContain("bg-secondary font-semibold text-secondary-foreground");
  });

  it("gives every category a consistent non-button heading separated by space, not rules", () => {
    const categoryLabels = ["Communication", "Workspace", "Operations", "Finance", "Insights", "Promotion"];
    const markup = renderToStaticMarkup(
      <PortalSidebar
        portalName="Vendor Portal"
        brandName="Malaysia Tourism"
        navigationLabel="Portal navigation"
        contextLabel="Vendor Owner"
        sections={categoryLabels.map((label, index) => ({
          label,
          items: [{ href: `/vendor/section-${index}`, label: `Item ${index + 1}`, icon: Package }],
        }))}
      />,
    );
    const headingClassNames = [...markup.matchAll(/<h2[^>]*data-sidebar-category-heading="true"[^>]*class="([^"]+)"/g)]
      .map((match) => match[1] ?? "");

    expect(headingClassNames).toHaveLength(categoryLabels.length);
    expect(new Set(headingClassNames).size).toBe(1);
    expect(markup).not.toContain("data-sidebar-category-divider");
    expect(markup.match(/<h2/g)).toHaveLength(categoryLabels.length);
    expect(headingClassNames.every((className) => !className.includes("rounded-lg"))).toBe(true);
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

    expect(markup).toContain('class="mt-0.5 whitespace-normal break-words text-xs text-foreground/70">Heritage Hotel Cameron Highlands</p>');
  });
});
