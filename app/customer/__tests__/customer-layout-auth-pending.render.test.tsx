import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/customer" }));
const passThrough = vi.hoisted(() => ({ children }: { children: unknown }) => children);
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@/components/providers/auth", () => ({ useRequireRole: () => ({ currentUser: null, loading: true }) }));
vi.mock("@/components/providers/cart", () => ({ useCart: () => ({ count: 0 }) }));
vi.mock("@/components/providers/wishlist", () => ({ WishlistProvider: passThrough, useWishlist: () => ({ savedIds: new Set() }) }));
vi.mock("@/components/providers/saved-destinations", () => ({ SavedDestinationsProvider: passThrough, useSavedDestinations: () => ({ savedStates: new Set() }) }));
vi.mock("@/components/providers/trip", () => ({ TripProvider: passThrough }));
vi.mock("@/components/providers/support-chat", () => ({ SupportChatProvider: passThrough }));
vi.mock("@/components/customer/customer-capability-gate-dialog", () => ({ CustomerCapabilityGateProvider: passThrough }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => () => false }));
vi.mock("@/backend/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/components/shared/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/shared/appearance-control", () => ({ AppearanceControl: () => null }));
vi.mock("@/components/shared/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/components/shared/currency-switcher", () => ({ CurrencySwitcher: () => null }));
vi.mock("@/components/customer/customer-site-footer", () => ({ CustomerSiteFooter: () => null }));
vi.mock("@/components/customer/customer-primary-navigation", () => ({ CustomerPrimaryNavigation: () => null }));
vi.mock("@/components/customer/customer-breadcrumbs", () => ({ CustomerBreadcrumbs: () => null }));

import CustomerLayout from "@/app/customer/layout";

function renderAt(pathname: string) {
  route.pathname = pathname;
  return renderToStaticMarkup(<CustomerLayout><p>page-content</p></CustomerLayout>);
}

describe("customer layout before sign-in state resolves", () => {
  it("renders browse pages and a neutral, disabled account button", () => {
    for (const pathname of ["/customer", "/customer/explore", "/customer/activity/a-1", "/customer/events/e-1"]) {
      const markup = renderAt(pathname);
      expect(markup).toContain("page-content");
      expect(markup).not.toContain("states.loadingEllipsis");
      expect(markup).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*aria-label="account.guestMenu"[^>]*disabled=""/);
      expect(markup).not.toMatch(/>G<\/span>/);
    }
  });

  it("keeps commerce and account pages behind the loading state", () => {
    for (const pathname of ["/customer/cart", "/customer/checkout", "/customer/wallet", "/customer/profile"]) {
      const markup = renderAt(pathname);
      expect(markup).toContain("states.loadingEllipsis");
      expect(markup).not.toContain("page-content");
    }
  });
});
