import {
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  MessageCircle,
  PartyPopper,
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
    labelKey: "communication",
    items: [
      { href: "/vendor/announcements", label: "Announcements", icon: Bell },
      { href: "/vendor/inbox", label: "Inbox", icon: MessageCircle },
    ],
  },
  {
    labelKey: "workspace",
    items: [
      { href: "/vendor/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/vendor/outlets", label: "Outlets", icon: MapPinned },
      { href: "/vendor/profile", label: "Business profile", icon: Building2 },
    ],
  },
  {
    labelKey: "promotion",
    items: [
      { href: "/vendor/event-promotions", label: "Promotions", icon: Megaphone },
      { href: "/vendor/events", label: "Events", icon: PartyPopper },
      { href: "/vendor/event-orders", label: "Reservations", icon: ClipboardList },
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
    labelKey: "insights",
    items: [{ href: "/vendor/analytics", label: "Analytics", icon: ChartNoAxesCombined }],
  },
];

const OUTLET_MANAGER_SECTIONS: VendorNavigationSection[] = [
  {
    labelKey: "communication",
    items: [
      { href: "/vendor/announcements", label: "Announcements", icon: Bell },
      { href: "/vendor/inbox", label: "Inbox", icon: MessageCircle },
    ],
  },
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
    labelKey: "insights",
    items: [{ href: "/vendor/analytics", label: "Analytics", icon: ChartNoAxesCombined }],
  },
];

// Event vendors: no outlets, catalogue, bookings or paid promotions.
const EVENT_VENDOR_SECTIONS: VendorNavigationSection[] = [
  {
    labelKey: "communication",
    items: [{ href: "/vendor/announcements", label: "Announcements", icon: Bell }],
  },
  {
    labelKey: "workspace",
    items: [{ href: "/vendor/events", label: "Events", icon: PartyPopper }],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/vendor/event-orders", label: "Reservations", icon: ClipboardList },
      { href: "/vendor/scanner", label: "Scanner", icon: ScanLine },
    ],
  },
  {
    labelKey: "finance",
    items: [{ href: "/vendor/wallet", label: "Wallet", icon: Wallet }],
  },
];

export function getVendorNavigationSections(isOutletManager: boolean, isEventVendor = false): VendorNavigationSection[] {
  if (isEventVendor) return EVENT_VENDOR_SECTIONS;
  return isOutletManager ? OUTLET_MANAGER_SECTIONS : VENDOR_OWNER_SECTIONS;
}
