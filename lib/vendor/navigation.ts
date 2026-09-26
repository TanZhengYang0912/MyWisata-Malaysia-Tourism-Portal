import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  LayoutDashboard,
  MapPinned,
  MessageCircle,
  ScanLine,
  ShoppingBag,
  Store,
  TicketPercent,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { OUTLET_MANAGER_SHOP_PAGE_HREF } from "@/lib/vendor/outlet-manager-navigation";

export type VendorNavigationItem = {
  href: string;
  activeHref?: string;
  label: string;
  icon: LucideIcon;
};

export type VendorNavigationSection = {
  labelKey: string;
  items: VendorNavigationItem[];
};

const VENDOR_OWNER_SECTIONS: VendorNavigationSection[] = [
  {
    labelKey: "workspace",
    items: [
      { href: "/vendor/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/vendor/outlets", label: "Outlets", icon: MapPinned },
      { href: "/vendor/profile", label: "Business profile", icon: Building2 },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/vendor/products", label: "Products", icon: UtensilsCrossed },
      { href: "/vendor/bookings", label: "Bookings", icon: CalendarDays },
      { href: "/vendor/redemptions", label: "Redemptions", icon: ClipboardCheck },
      { href: "/vendor/vouchers", label: "Vouchers", icon: TicketPercent },
      { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
    ],
  },
  {
    labelKey: "finance",
    items: [{ href: "/vendor/wallet", label: "Wallet", icon: Wallet }],
  },
  {
    labelKey: "communication",
    items: [{ href: "/vendor/inbox", label: "Inbox", icon: MessageCircle }],
  },
  {
    labelKey: "insights",
    items: [{ href: "/vendor/analytics", label: "Analytics", icon: ChartNoAxesCombined }],
  },
];

const OUTLET_MANAGER_SECTIONS: VendorNavigationSection[] = [
  {
    labelKey: "workspace",
    items: [
      { href: "/vendor/dashboard", label: "Operations", icon: LayoutDashboard },
      { href: OUTLET_MANAGER_SHOP_PAGE_HREF, activeHref: "/vendor/outlets", label: "Shop page", icon: Store },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/vendor/products", label: "Products", icon: UtensilsCrossed },
      { href: "/vendor/bookings", label: "Bookings", icon: CalendarDays },
      { href: "/vendor/scanner", label: "Scanner", icon: ScanLine },
      { href: "/vendor/vouchers", label: "Vouchers", icon: TicketPercent },
      { href: "/vendor/orders", label: "Orders", icon: ShoppingBag },
    ],
  },
  {
    labelKey: "communication",
    items: [{ href: "/vendor/inbox", label: "Inbox", icon: MessageCircle }],
  },
  {
    labelKey: "insights",
    items: [{ href: "/vendor/analytics", label: "Analytics", icon: ChartNoAxesCombined }],
  },
];

export function getVendorNavigationSections(isOutletManager: boolean): VendorNavigationSection[] {
  return isOutletManager ? OUTLET_MANAGER_SECTIONS : VENDOR_OWNER_SECTIONS;
}
