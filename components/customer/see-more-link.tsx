"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

/** The one "See more" style for section headers: hover underline, focus ring. */
export function SeeMoreLink({ href }: { href: string }) {
  const { t } = useTranslation("customer");
  return (
    <Link href={href} className="inline-flex min-h-10 shrink-0 items-center text-sm font-bold text-primary transition-colors hover:text-accent hover:underline active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      {t("ui.actions.seeMore")}
    </Link>
  );
}
