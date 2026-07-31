import type { LucideIcon } from "lucide-react";
import { Bell, Gift, Heart, Inbox, Map, MessageCircle, ReceiptText, Search, ShieldCheck, SlidersHorizontal, Star, Store, UserRound, WalletCards } from "lucide-react";

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
  { href: "/customer/for-you", label: "For You", icon: Star },
  { href: "/customer/explore", label: "Explore", icon: Search },
  { href: "/customer/map", label: "Map", icon: Map },
  { href: "/customer/chat", label: "Chat", icon: MessageCircle },
  { href: "/customer/activity?tab=itinerary", label: "My Activity", icon: ReceiptText },
  { href: "/customer/wishlist", label: "Saved", icon: Heart },
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
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}
