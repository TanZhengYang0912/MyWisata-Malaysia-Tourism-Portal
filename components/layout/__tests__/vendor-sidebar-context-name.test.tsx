import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth: mockUseAuth }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/layout/portal-sidebar", () => ({
  PortalSidebar: ({ contextDetail }: { contextDetail?: string }) => <div>{contextDetail}</div>,
}));
vi.mock("@/components/legal/legal-nav", () => ({ legalNavItems: () => [] }));

import VendorSidebar from "../vendor-sidebar";

describe("VendorSidebar workspace context", () => {
  it("shows the vendor name for a vendor owner", () => {
    mockUseAuth.mockReturnValue({
      user: { vendorName: "Ghee Hiang" },
      isOutletManager: false,
      isVendorOwner: true,
      isEventVendor: false,
    });

    const markup = renderToStaticMarkup(<VendorSidebar />);

    expect(markup).toContain("Ghee Hiang");
    expect(markup).not.toContain("shell.workspace");
  });

  it("keeps the assigned outlet name for an outlet manager", () => {
    mockUseAuth.mockReturnValue({
      user: { vendorName: "Ghee Hiang", activeOutletName: "Melaka Outlet" },
      isOutletManager: true,
      isVendorOwner: false,
      isEventVendor: false,
    });

    const markup = renderToStaticMarkup(<VendorSidebar />);

    expect(markup).toContain("Melaka Outlet");
  });
});
