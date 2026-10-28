"use client";

import { useEffect, type RefObject } from "react";

/**
 * Lays the customer header out in one row only when everything really fits, otherwise in two rows (the phone
 * layout), and publishes the header's real height as `--customer-header-h` so the home hero is exactly one screen
 * below it. Measured instead of breakpoint-based, so longer ms / zh-CN labels adapt too. Until this runs, CSS shows
 * one row from `xl` (see app/customer/layout.tsx). `remeasureKey` re-runs it when labels or controls change while the
 * desktop links are hidden (language, sign-in), which no resize would report.
 */
export function useCustomerHeaderLayout(
  headerRef: RefObject<HTMLElement | null>,
  linksRef: RefObject<HTMLElement | null>,
  remeasureKey: string,
) {
  useEffect(() => {
    const header = headerRef.current;
    const links = linksRef.current;
    const row = links?.parentElement;
    if (!header || !links || !row) return;
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      // Always try one row first so the result never depends on the current layout.
      header.dataset.layout = "single";
      const fits = links.scrollWidth <= links.clientWidth + 1 && row.scrollWidth <= row.clientWidth + 1;
      header.dataset.layout = fits ? "single" : "stacked";
      document.documentElement.style.setProperty("--customer-header-h", `${header.offsetHeight}px`);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(header);
    for (const element of [...Array.from(row.children), ...Array.from(links.children)]) observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [headerRef, linksRef, remeasureKey]);
}
