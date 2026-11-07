// Site footer for customer, guest, Help Center and legal pages.
// Plan: Docs/plans/2026-10-13-0033-customer-site-footer.md
// Labels are customer-namespace keys, reusing the header/menu keys wherever the
// destination is the same, so header and footer always read alike.

export type CustomerFooterLink = { href: string; labelKey: string };
export type CustomerFooterGroup = { id: string; titleKey: string; links: CustomerFooterLink[] };
export type CustomerFooterVariant = "full" | "slim" | "none";

export const CUSTOMER_FOOTER_GROUPS: CustomerFooterGroup[] = [
  {
    id: "support",
    titleKey: "footer.groups.support",
    links: [
      { href: "/help", labelKey: "legal.nav.help" },
      { href: "/customer/support", labelKey: "footer.links.contactSupport" },
      { href: "/customer/orders", labelKey: "accountItems.orders.label" },
    ],
  },
  {
    id: "discover",
    titleKey: "footer.groups.discover",
    links: [
      { href: "/customer/explore", labelKey: "navigation.explore" },
      { href: "/customer/events", labelKey: "navigation.events" },
      { href: "/customer/vendors", labelKey: "navigation.search" },
      { href: "/customer/trip", labelKey: "footer.links.tripPlanner" },
      { href: "/customer/vouchers", labelKey: "footer.links.vouchers" },
    ],
  },
  {
    id: "partners",
    titleKey: "footer.groups.partners",
    links: [
      { href: "/customer/profile/register-vendor", labelKey: "accountItems.becomeVendor.label" },
      { href: "/customer/affiliate", labelKey: "accountItems.earnShare.label" },
      { href: "/customer/recommendations", labelKey: "accountItems.recommendVendor.label" },
      { href: "/login", labelKey: "footer.links.vendorLogin" },
    ],
  },
  {
    id: "legal",
    titleKey: "footer.groups.legal",
    links: [
      { href: "/legal/privacy", labelKey: "footer.links.privacyPolicy" },
      { href: "/legal/terms", labelKey: "footer.links.termsOfService" },
      { href: "/legal/data", labelKey: "legal.nav.data" },
    ],
  },
  {
    id: "about",
    titleKey: "footer.groups.about",
    links: [{ href: "/legal/about", labelKey: "footer.links.aboutUs" }],
  },
];

/**
 * Which footer a customer-layout page gets: none on the trip planner (the only
 * fixed full-height workspace), slim while paying (cart, checkout), full elsewhere.
 */
export function customerFooterVariant(pathname: string): CustomerFooterVariant {
  if (/^\/customer\/trip\/[^/]+\/?$/.test(pathname)) return "none";
  if (/^\/customer\/(cart|checkout)(\/|$)/.test(pathname)) return "slim";
  return "full";
}
