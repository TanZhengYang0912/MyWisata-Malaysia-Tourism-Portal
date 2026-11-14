"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/utils";
import { MyLawatanMark } from "@/components/shared/mylawatan-logo";
import { HEADER_ICON_BUTTON_CLASS } from "@/components/shared/header-icon-button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
  /** Primary workspace line: who or what this session is working as (e.g. the vendor name, or the staff role). */
  contextLabel: ReactNode;
  contextDetail?: ReactNode;
  sections: PortalSidebarSection[];
  /** Small links under the menu (e.g. privacy and terms); open in a new tab so the portal stays put. */
  footerLinks?: { href: string; label: ReactNode }[];
  /** Fixed desktop sidebar; below the lg breakpoint it becomes a menu button that opens the same content as a drawer. */
  fixed?: boolean;
  /** Accessible name of the phone menu button. */
  menuLabel?: string;
  className?: string;
};

function itemPath(item: PortalSidebarItem) {
  return (item.activeHref ?? item.href).split("?")[0];
}

function isActive(pathname: string, item: PortalSidebarItem) {
  const path = itemPath(item);
  return pathname === path || pathname.startsWith(`${path}/`);
}

function SidebarBody({
  portalName,
  brandName,
  navigationLabel,
  contextLabel,
  contextDetail,
  sections,
  footerLinks,
  inDrawer = false,
  onNavigate,
}: Omit<PortalSidebarProps, "fixed" | "menuLabel" | "className"> & { inDrawer?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const visibleSections = sections.filter((section) => section.items.length > 0);
  // Session data arrives after the first paint and can swap the menu or grow the context block above it,
  // so the "keep the current page in view" pass also reruns when either changes, not only on navigation.
  const menuShapeKey = `${visibleSections.map((section) => section.items.map((item) => item.href).join(",")).join("|")}#${contextDetail ? 1 : 0}`;

  // Long menus (admin) can push the current page below the fold; keep it in view so the rail answers "where am I".
  useEffect(() => {
    const activeLink = activeLinkRef.current;
    if (activeLink && typeof activeLink.scrollIntoView === "function") activeLink.scrollIntoView({ block: "nearest" });
  }, [pathname, menuShapeKey]);

  return (
    <>
      {/* The drawer's close button sits top-right, so leave room for it beside the brand. */}
      <div className={cn("flex items-center gap-2.5 px-5 pb-4 pt-5", inDrawer && "pr-14")}>
        {/* The navy mark disappears on the dark card, so it gets a white backing in dark mode only. */}
        <span className="flex shrink-0 items-center justify-center dark:rounded-md dark:bg-white dark:p-1">
          <MyLawatanMark size={26} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[0.9375rem] font-bold tracking-tight text-foreground">{brandName}</p>
          <p className="truncate text-xs text-muted-foreground">{portalName}</p>
        </div>
      </div>

      <div data-portal-sidebar-context className="mx-3 rounded-lg bg-muted px-3 py-2.5">
        <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-foreground">{contextLabel}</p>
        {contextDetail && <p className="mt-0.5 whitespace-normal break-words text-xs text-foreground/70">{contextDetail}</p>}
      </div>

      <nav
        aria-label={navigationLabel}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-py-3 px-3 pb-6 pt-4 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
      >
        {visibleSections.map((section, sectionIndex) => (
          <div key={sectionIndex} data-sidebar-section={sectionIndex === 0 ? "first" : "group"} className={cn(sectionIndex > 0 && "mt-5")}>
            <h2
              data-sidebar-category-heading="true"
              className="px-3 pb-1.5 text-xs font-medium text-muted-foreground"
            >
              {section.label}
            </h2>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    ref={active ? activeLinkRef : undefined}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      inDrawer && "min-h-11",
                      active
                        ? "bg-secondary font-semibold text-secondary-foreground"
                        : "font-medium text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon
                      size={17}
                      className={cn(
                        "shrink-0 transition-colors duration-150",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.count != null && item.count > 0 && (
                      <span
                        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold tabular-nums text-primary-foreground"
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
      </nav>

      {footerLinks && footerLinks.length > 0 && (
        <div data-portal-sidebar-footer className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border px-5 py-3.5 text-xs">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener"
              className="rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function PortalSidebar({ fixed = false, menuLabel = "Menu", className, ...body }: PortalSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside
        data-portal-sidebar="true"
        className={cn(
          "flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card text-foreground",
          fixed && "fixed inset-y-0 left-0 z-40 max-lg:hidden",
          className,
        )}
      >
        <SidebarBody {...body} />
      </aside>

      {/* Phones and tablets: the portal headers leave the top-left corner free for this button. */}
      {fixed && (
        <>
          <button
            type="button"
            data-portal-menu-button
            aria-label={menuLabel}
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={cn(HEADER_ICON_BUTTON_CLASS, "fixed left-4 top-3.5 z-50 border border-border bg-card shadow-sm lg:hidden")}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              data-portal-drawer
              aria-describedby={undefined}
              className="left-0 top-0 flex h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 border-r border-border bg-card p-0 text-foreground sm:max-w-[85vw] lg:hidden"
            >
              <DialogTitle className="sr-only">{body.navigationLabel}</DialogTitle>
              <SidebarBody {...body} inDrawer onNavigate={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
