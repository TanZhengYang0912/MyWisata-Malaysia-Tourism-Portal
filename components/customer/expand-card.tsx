"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shared card shell for discovery cards (ActivityCard, VendorCard): media, title, optional price,
 * and a details drawer that opens on hover, keyboard focus, or a first tap on touch screens.
 * Each card keeps its own data and links and only passes content in.
 * The drawer styles are the `.mw-card-expand-card` rules in app/globals.css.
 */
export function ExpandCard({ media, title, price, details, detailsId, action }: {
  media: ReactNode;
  title: ReactNode;
  price?: ReactNode;
  details: ReactNode;
  detailsId: string;
  action: { href: string; label: string; onClick?: () => void };
}) {
  const [open, setOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!articleRef.current?.contains(event.target as Node)) {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && articleRef.current?.contains(focused)) focused.blur();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function handleCardClickCapture(event: React.MouseEvent<HTMLElement>) {
    if (event.detail === 0 || !window.matchMedia?.("(hover: none)").matches) return;

    let target = event.target as Node | null;
    let link = false;
    while (target && target !== event.currentTarget) {
      if (target.nodeType === 1) {
        const element = target as Element;
        if (element.tagName === "BUTTON") return;
        if (element.tagName === "A") link = true;
      }
      target = target.parentNode;
    }

    if (!open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(true);
    } else if (!link) {
      ctaRef.current?.click();
    }
  }

  return (
    <article ref={articleRef} data-open={open ? "true" : undefined} className="mw-card mw-card-expand-card group" onClickCapture={handleCardClickCapture}>
      <div className="mw-card-media">{media}</div>
      <div className="mw-card-body mw-card-body-compact space-y-2 p-4">
        {title}
        <div className="mw-card-footer mw-card-footer-stacked pt-1">
          {price && <div className="mw-card-price-row">{price}</div>}
          <div className="mw-card-cta-row">
            <div className="mw-card-cta-drawer">
              <div id={detailsId} data-card-details-inline="true" className="mw-card-details-expand">
                <div className="mw-card-details-expand-inner"><div className="space-y-2 border-t border-dashed border-border pb-3 pt-3">{details}</div></div>
              </div>
              <Button asChild size="sm" className="h-9 w-full rounded-full px-3 text-center text-xs font-bold">
                <Link ref={ctaRef} href={action.href} onClick={action.onClick} data-card-primary-cta="true">{action.label}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
