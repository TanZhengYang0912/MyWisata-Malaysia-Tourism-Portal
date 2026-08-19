import type { LucideIcon } from "lucide-react";
import { Bell, Compass, Gift, Heart, Home, Inbox, Map, MessageCircle, ReceiptText, ShieldCheck, SlidersHorizontal, Star, Store, Tag, UserRound, WalletCards } from "lucide-react";

export type CustomerNavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type CustomerAccountItem = CustomerNavigationItem & {
  description: string;
};

export type CustomerAccountGroup = {
  label: string;
  items: CustomerAccountItem[];
};

export const CUSTOMER_NAV: CustomerNavigationItem[] = [
  { href: "/customer", label: "Home", icon: Home },
  { href: "/customer/explore", label: "Explore", icon: Compass },
  { href: "/customer/partners", label: "Partners", icon: Store },
  { href: "/customer/trip", label: "Trip", icon: Map },
  { href: "/customer/chat", label: "Chat", icon: MessageCircle },
  { href: "/customer/activity?tab=itinerary", label: "My Activity", icon: ReceiptText },
  { href: "/customer/saved", label: "Saved", icon: Heart },
];

export const ACCOUNT_MENU_GROUPS: CustomerAccountGroup[] = [
  {
    label: "Account",
    items: [
      { href: "/customer/profile", label: "Profile", description: "Your personal details", icon: UserRound },
      { href: "/customer/notifications", label: "Notifications", description: "Bookings, wallet and account updates", icon: Bell },
      { href: "/customer/preferences", label: "Preferences", description: "Tune your recommendation feed", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Payments & verification",
    items: [
      { href: "/customer/vouchers", label: "My Vouchers", description: "Claimed partner deals", icon: Tag },
      { href: "/customer/wallet", label: "Wallet", description: "Balance and payouts", icon: WalletCards },
      { href: "/customer/kyc", label: "Verification", description: "Verify your identity", icon: ShieldCheck },
    ],
  },
  {
    label: "Help",
    items: [
      { href: "/customer/support", label: "Support", description: "Get help with your trip", icon: Inbox },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/customer/affiliate", label: "Earn & Share", description: "Manage affiliate activity", icon: Gift },
      { href: "/customer/profile/register-vendor", label: "Become a Vendor", description: "Apply to list your business", icon: Store },
      { href: "/customer/recommendations", label: "Recommend a Vendor", description: "Share local discoveries", icon: Star },
    ],
  },
];

export function getAllAccountRoutes(): string[] {
  return ACCOUNT_MENU_GROUPS.flatMap((group) => group.items.map((item) => item.href));
}

export function getCustomerDisplayName(user: { name?: string | null; email?: string | null }): string {
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && name !== email) return name;
  return email?.split("@")[0]?.trim() || name || "Account";
}

export function isCustomerNavActive(pathname: string, href: string): boolean {
  const targetPath = href.split("?")[0];
  // Home is exactly /customer — use strict equality so it does not light up on every sub-route.
  if (targetPath === "/customer") return pathname === "/customer";
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
