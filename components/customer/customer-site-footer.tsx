"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { CUSTOMER_FOOTER_GROUPS, type CustomerFooterVariant } from "@/lib/customer/footer-navigation";
import { cn } from "@/lib/utils";

/**
 * Site footer for customer, guest, Help Center and legal pages.
 * `full`: link columns + copyright. `slim` (cart, checkout, login): copyright +
 * Privacy · Terms · Data & KYC · Help. `none`: nothing (trip planner).
 * Plan: Docs/plans/2026-10-13-0033-customer-site-footer.md
 */
export function CustomerSiteFooter({ variant = "full", className }: { variant?: CustomerFooterVariant; className?: string }) {
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const pathname = usePathname();
  if (variant === "none") return null;

  const copyright = tCommon("brand.copyright", { year: new Date().getFullYear() });

  if (variant === "slim") {
    return (
      <footer data-site-footer="slim" className={cn("w-full border-t border-border px-4 py-5 text-center text-xs text-muted-foreground print:hidden", className)}>
        <p>{copyright}</p>
        <LegalFooterLinks className="mt-2" />
      </footer>
    );
  }

  return (
    <footer data-site-footer="full" aria-label={tCustomer("footer.ariaLabel")} className={cn("w-full border-t border-border bg-card print:hidden", className)}>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:px-8">
        {CUSTOMER_FOOTER_GROUPS.map((group) => (
          <nav key={group.id} aria-labelledby={`site-footer-${group.id}`}>
            <h2 id={`site-footer-${group.id}`} className="text-sm font-bold text-foreground">{tCustomer(group.titleKey)}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline",
                        active ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {tCustomer(link.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-3 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">{copyright}</p>
      </div>
    </footer>
  );
}
