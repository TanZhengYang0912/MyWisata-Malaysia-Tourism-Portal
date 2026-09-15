import {
  Activity,
  Bot,
  ClipboardCheck,
  DollarSign,
  FileBarChart2,
  Flag,
  Gem,
  Inbox,
  Link2,
  Megaphone,
  Package,
  RotateCcw,
  Scale,
  Settings2,
  Shield,
  ShieldBan,
  ShieldCog,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  UserX,
  type LucideIcon,
} from "lucide-react";

import type { StaffModule } from "@/lib/staff-permissions/types";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  bot: Bot,
  "clipboard-check": ClipboardCheck,
  "dollar-sign": DollarSign,
  "file-bar-chart-2": FileBarChart2,
  flag: Flag,
  gem: Gem,
  inbox: Inbox,
  "link-2": Link2,
  megaphone: Megaphone,
  package: Package,
  "rotate-ccw": RotateCcw,
  scale: Scale,
  "settings-2": Settings2,
  shield: Shield,
  "shield-ban": ShieldBan,
  "shield-cog": ShieldCog,
  sparkles: Sparkles,
  "user-round-check": UserRoundCheck,
  "users-round": UsersRound,
  "user-x": UserX,
};

export type StaffNavigationItem = StaffModule & { icon: LucideIcon };

export type StaffNavigationSection = {
  key: string;
  label: string;
  labelKey: string | null;
  sortOrder: number;
  items: StaffNavigationItem[];
};

export function staffNavigationIcon(iconKey: string): LucideIcon {
  return ICONS[iconKey] ?? Activity;
}

export function staffNavigationSections(modules: readonly StaffModule[]): StaffNavigationSection[] {
  const grouped = new Map<string, StaffNavigationSection>();
  for (const staffModule of modules) {
    const section = grouped.get(staffModule.sectionKey) ?? {
      key: staffModule.sectionKey,
      label: staffModule.sectionLabel,
      labelKey: staffModule.sectionLabelKey,
      sortOrder: staffModule.sectionSortOrder,
      items: [],
    };
    section.items.push({ ...staffModule, icon: staffNavigationIcon(staffModule.iconKey) });
    grouped.set(staffModule.sectionKey, section);
  }

  return [...grouped.values()]
    .map((section) => ({
      ...section,
      items: section.items.sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key));
}
