"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/utils";

export type PortalSidebarItem = {
  href: string;
  activeHref?: string;
  label: ReactNode;
  icon: LucideIcon;
  count?: number;
  countLabel?: string;
};

export type PortalSidebarSection = {
  label: ReactNode;
  items: PortalSidebarItem[];
};

export type PortalSidebarProps = {
  portalName: ReactNode;
  brandName: ReactNode;
  navigationLabel: string;
  contextLabel: ReactNode;
  contextDetail?: ReactNode;
  sections: PortalSidebarSection[];
  fixed?: boolean;
  className?: string;
};

function itemPath(item: PortalSidebarItem) {
  return (item.activeHref ?? item.href).split("?")[0];
}

function isActive(pathname: string, item: PortalSidebarItem) {
  const path = itemPath(item);
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function PortalSidebar({
  portalName,
  brandName,
  navigationLabel,
  contextLabel,
  contextDetail,
  sections,
  fixed = false,
  className,
}: PortalSidebarProps) {
  const pathname = usePathname();
  const visibleSections = sections.filter((section) => section.items.length > 0);

  return (
    <aside
      data-portal-sidebar="true"
      className={cn(
        "flex h-screen w-60 shrink-0 flex-col bg-slate-950 text-slate-200",
        fixed && "fixed inset-y-0 left-0 z-40 max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:top-auto max-lg:h-16 max-lg:w-full max-lg:flex-row max-lg:overflow-hidden max-lg:[contain:layout_paint]",
        className,
      )}
    >
      <div className="border-b border-white/10 px-4 py-4 max-lg:hidden">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
            <Building2 size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-slate-400">{portalName}</p>
            <p className="truncate text-sm font-bold text-white">{brandName}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-4 max-lg:hidden">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{contextLabel}</p>
            {contextDetail && <p className="mt-0.5 truncate text-xs text-slate-400">{contextDetail}</p>}
          </div>
        </div>
      </div>

      <nav aria-label={navigationLabel} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 max-lg:min-w-0 max-lg:overflow-hidden max-lg:px-2 max-lg:py-2">
        <div className="max-lg:w-full max-lg:min-w-0 max-lg:overflow-x-auto max-lg:overscroll-contain">
          <div className="max-lg:flex max-lg:w-max max-lg:min-w-full">
            {visibleSections.map((section, sectionIndex) => (
              <div key={sectionIndex} data-sidebar-section={sectionIndex === 0 ? "first" : "group"} className="first:pt-0 pt-5 max-lg:flex max-lg:shrink-0 max-lg:items-center max-lg:pt-0">
                <p className="px-3 pb-2 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-slate-500 max-lg:hidden">{section.label}</p>
                <div className="space-y-1 max-lg:flex max-lg:gap-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 max-lg:shrink-0",
                      active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors",
                        active ? "bg-primary" : "bg-transparent group-hover:bg-white/20",
                      )}
                    />
                    <item.icon size={17} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count != null && item.count > 0 && (
                      <span
                        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold text-white"
                        aria-label={item.countLabel ?? String(item.count)}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}
