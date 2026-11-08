import { outletRepeatsVendor } from "@/lib/outlet-display";

export type CustomerBreadcrumbToken = { labelKey: string; href?: string };
export type CustomerBreadcrumbModel = { mode: "automatic" | "page-owned" | "hidden"; items: readonly CustomerBreadcrumbToken[] };

export function getProductBreadcrumbAncestors(
  outlet: { vendorId: string; vendorName: string; outletId: string; outletName: string },
  publicPlace: boolean,
): Array<{ label: string; href: string }> {
  if (publicPlace) return [{ label: 'explore', href: '/customer/explore?tab=experiences' }];
  return [
    { label: 'vendors', href: '/customer/vendors' },
    { label: outlet.vendorName, href: `/customer/vendors/${encodeURIComponent(outlet.vendorId)}` },
    ...(outletRepeatsVendor(outlet.outletName, outlet.vendorName) ? [] : [{ label: outlet.outletName, href: `/customer/outlets/${encodeURIComponent(outlet.outletId)}` }]),
  ];
}

const home = { labelKey: "navigation.home", href: "/customer" };
const topLevel: Record<string, string> = {
  explore: "navigation.explore", partners: "navigation.search", vendors: "navigation.search", events: "navigation.events", trip: "navigation.trip",
  activity: "navigation.activity", orders: "accountItems.orders.label", saved: "accountItems.saved.label",
  vouchers: "accountItems.vouchers.label", wallet: "accountItems.wallet.label", notifications: "accountItems.notifications.label",
  profile: "accountItems.profile.label", preferences: "accountItems.preferences.label", support: "accountItems.support.label",
  recommendations: "accountItems.recommendVendor.label", affiliate: "accountItems.earnShare.label",
  calendar: "ui.breadcrumbs.calendar", map: "navigation.map", phone: "ui.breadcrumbs.phone",
  kyc: "ui.breadcrumbs.kyc", "for-you": "ui.breadcrumbs.forYou",
};
const hidden = { mode: "hidden", items: [] } as const;
const owned = { mode: "page-owned", items: [] } as const;
const nested: Array<{ pattern: RegExp; parent?: string; labelKey: string }> = [
  { pattern: /^\/customer\/orders\/access$/, parent: "orders", labelKey: "ui.breadcrumbs.orderAccess" },
  { pattern: /^\/customer\/orders\/[^/]+$/, parent: "orders", labelKey: "ui.breadcrumbs.orderDetails" },
  { pattern: /^\/customer\/bookings\/[^/]+$/, parent: "orders", labelKey: "ui.breadcrumbs.bookingDetails" },
  { pattern: /^\/customer\/wallet\/withdrawals\/[^/]+$/, parent: "wallet", labelKey: "ui.breadcrumbs.withdrawalDetails" },
  { pattern: /^\/customer\/support\/[^/]+$/, parent: "support", labelKey: "ui.breadcrumbs.supportDetails" },
  { pattern: /^\/customer\/recommendations\/[^/]+$/, parent: "recommendations", labelKey: "ui.breadcrumbs.recommendationDetails" },
  { pattern: /^\/customer\/affiliate\/earnings$/, parent: "affiliate", labelKey: "ui.breadcrumbs.earnings" },
  { pattern: /^\/customer\/profile\/register-vendor$/, parent: "profile", labelKey: "accountItems.becomeVendor.label" },
  { pattern: /^\/customer\/profile\/[^/]+$/, labelKey: "ui.breadcrumbs.publicProfile" },
  { pattern: /^\/customer\/event-promotions\/[^/]+$/, labelKey: "ui.breadcrumbs.eventPromotion" },
];

export function getCustomerBreadcrumbModel(pathname: string): CustomerBreadcrumbModel {
  if (pathname === "/customer" || /^\/customer\/(cart|checkout)(\/|$)/.test(pathname)
    || /^\/customer\/trip\/[^/]+/.test(pathname)
    || /^\/customer\/(outlet|wishlist|search|verification)(\/|$)/.test(pathname)) return hidden;
  if (/^\/customer\/(place|destination|vendor|vendors|outlets|products|activity|experience|events)\/[^/]+/.test(pathname)) return owned;
  const nestedMatch = nested.find(({ pattern }) => pattern.test(pathname));
  if (nestedMatch) return { mode: "automatic", items: [
    home,
    ...(nestedMatch.parent ? [{ labelKey: topLevel[nestedMatch.parent], href: `/customer/${nestedMatch.parent}` }] : []),
    { labelKey: nestedMatch.labelKey },
  ] };
  const match = /^\/customer\/([^/]+)$/.exec(pathname);
  const labelKey = match && topLevel[match[1]];
  return labelKey ? { mode: "automatic", items: [home, { labelKey }] } : hidden;
}
