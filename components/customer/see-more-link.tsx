"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

/** The one "See more" style for going to a fuller page: navy, yellow on hover/press, focus ring. `ariaLabel` names where it goes when a page has several. */
export function SeeMoreLink({ href, ariaLabel, onClick }: { href: string; ariaLabel?: string; onClick?: () => void }) {
  const { t } = useTranslation("customer");
  const label = t("ui.actions.seeMore");
  // The accessible name starts with the visible text (WCAG 2.5.3), then says where it goes.
  return (
    <Link href={href} onClick={onClick} aria-label={ariaLabel ? `${label}: ${ariaLabel}` : undefined} className="inline-flex min-h-10 shrink-0 items-center text-sm font-bold text-primary transition-colors hover:text-accent active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      {label}
    </Link>
  );
}
