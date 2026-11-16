"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { MyLawatanLogo } from "@/components/shared/mylawatan-logo";
import { CustomerSiteFooter } from "@/components/customer/customer-site-footer";

// Public, auth-free layout for the legal/trust pages — mirrors app/help/layout.tsx
// so anonymous visitors and search engines can read them without the /customer/*
// role gate. The site footer cross-links the legal pages and marks the current one.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/customer/explore" className="flex shrink-0 items-center gap-2">
            <MyLawatanLogo
              markSize={32}
              wordmarkClassName="font-[family-name:var(--font-plus-jakarta-sans)] text-lg font-bold tracking-tight text-foreground"
            />
          </Link>
          <LanguageSwitcher compact className="min-w-0 sm:w-auto" />
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <CustomerSiteFooter />
    </div>
  );
}
