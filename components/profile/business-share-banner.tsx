"use client";

import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BusinessShareBanner() {
  const { t: tCustomer } = useTranslation("customer");

  return (
    <Link href="/customer/profile/register-vendor" className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-left transition hover:border-primary/30 hover:bg-primary/[0.08]">
      <span className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><Store size={18} /></span>
        <span><span className="block text-sm font-bold text-foreground">{tCustomer("ui.profileWizard.businessPrompt")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{tCustomer("ui.profileWizard.businessDescription")}</span></span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-primary" />
    </Link>
  );
}
