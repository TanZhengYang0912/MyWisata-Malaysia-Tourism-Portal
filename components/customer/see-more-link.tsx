"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

/** The one "See More" style for Home section headers: arrow, hover underline, focus ring. */
export function SeeMoreLink({ href }: { href: string }) {
  const { t } = useTranslation("customer");
  return (
    <Link href={href} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-accent hover:underline active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      {t("ui.actions.seeMore")} <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}
