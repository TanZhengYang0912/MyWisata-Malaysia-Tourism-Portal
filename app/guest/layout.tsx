"use client";

import Link from "next/link";
import { Globe } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useTranslation } from "react-i18next";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  const { t: tCommon } = useTranslation("common");

  return (
    <>
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:flex-nowrap sm:px-6">
          <Link href="/guest/explore" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white"><Globe size={16} /></span>
            {BRAND_NAME}
          </Link>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
            <LanguageSwitcher compact className="min-w-0 sm:w-auto" />
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">{tCommon("guest.mode")}</span>
            <Link href="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{tCommon("account.signIn")}</Link>
          </div>
        </div>
      </header>
      {children}
    </div>
    </>
  );
}
