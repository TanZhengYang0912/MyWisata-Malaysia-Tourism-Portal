import type { LucideIcon } from "lucide-react";
import { Bell, Compass, Gift, Heart, Home, Inbox, Map, MessageCircle, ReceiptText, ShieldCheck, SlidersHorizontal, Star, Store, Tag, WalletCards } from "lucide-react";

export type CustomerNavigationItem = {
  href: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
};

export type CustomerAccountItem = CustomerNavigationItem & {
  description: string;
};

export type CustomerAccountGroup = {
  label: string;
  labelKey: string;
  items: CustomerAccountItem[];
};

export const CUSTOMER_NAV: CustomerNavigationItem[] = [
  { href: "/customer", label: "Home", labelKey: "navigation.home", icon: Home },
  { href: "/customer/explore", label: "Explore", labelKey: "navigation.explore", icon: Compass },
  { href: "/customer/partners", label: "Partners", labelKey: "navigation.search", icon: Store },
  { href: "/customer/trip", label: "Trip", labelKey: "navigation.map", icon: Map },
  { href: "/customer/chat", label: "Chat", labelKey: "navigation.chat", icon: MessageCircle },
  { href: "/customer/activity?tab=itinerary", label: "My Activity", labelKey: "navigation.activity", icon: ReceiptText },
  { href: "/customer/saved", label: "Saved", labelKey: "navigation.wishlist", icon: Heart },
];

export const ACCOUNT_MENU_GROUPS: CustomerAccountGroup[] = [
  {
    label: "Account",
    labelKey: "accountGroups.account",
    items: [
      { href: "/customer/profile", label: "Profile & Verification", labelKey: "accountItems.profile", description: "Choose and manage independent verification", icon: ShieldCheck },
      { href: "/customer/notifications", label: "Notifications", labelKey: "accountItems.notifications", description: "Bookings, wallet and account updates", icon: Bell },
      { href: "/customer/preferences", label: "Preferences", labelKey: "accountItems.preferences", description: "Tune your recommendation feed", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Payments & verification",
    labelKey: "accountGroups.paymentsVerification",
    items: [
      { href: "/customer/orders", label: "My Orders", labelKey: "accountItems.orders", description: "Purchases, bookings and receipts", icon: ReceiptText },
      { href: "/customer/vouchers", label: "My Vouchers", labelKey: "accountItems.vouchers", description: "Claimed partner deals", icon: Tag },
      { href: "/customer/wallet", label: "Wallet", labelKey: "accountItems.wallet", description: "Balance and payouts", icon: WalletCards },
    ],
  },
  {
    label: "Help",
    labelKey: "accountGroups.help",
    items: [
      { href: "/customer/support", label: "Support", labelKey: "accountItems.support", description: "Get help with your trip", icon: Inbox },
    ],
  },
  {
    label: "More",
    labelKey: "accountGroups.more",
    items: [
      { href: "/customer/affiliate", label: "Earn & Share", labelKey: "accountItems.earnShare", description: "Manage affiliate activity", icon: Gift },
      { href: "/customer/profile/register-vendor", label: "Become a Vendor", labelKey: "accountItems.becomeVendor", description: "Apply to list your business", icon: Store },
      { href: "/customer/recommendations", label: "Recommend a Vendor", labelKey: "accountItems.recommendVendor", description: "Share local discoveries", icon: Star },
    ],
  },
];

export function getAllAccountRoutes(): string[] {
  return ACCOUNT_MENU_GROUPS.flatMap((group) => group.items.map((item) => item.href));
}

export function getCustomerDisplayName(user: { name?: string | null; email?: string | null }, localizedFallback: string): string {
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && name !== email) return name;
  return email?.split("@")[0]?.trim() || name || localizedFallback;
}

export function isCustomerNavActive(pathname: string, href: string): boolean {
  const targetPath = href.split("?")[0];
  // Home is exactly /customer — use strict equality so it does not light up on every sub-route.
  if (targetPath === "/customer") return pathname === "/customer";
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
