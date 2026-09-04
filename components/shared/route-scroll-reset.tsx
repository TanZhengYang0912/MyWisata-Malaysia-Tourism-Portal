"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * RouteScrollReset ensures that navigating to any new page or route
 * automatically resets the viewport to the very top, both for the window
 * and for any layout inner scroll containers (such as admin/vendor portals).
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Reset window and document scroll immediately
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;

      // Reset any inner layout scroll containers (e.g. admin main scroll viewport)
      const scrollContainers = document.querySelectorAll<HTMLElement>("[data-scroll-container]");
      scrollContainers.forEach((container) => {
        container.scrollTop = 0;
      });
    }
  }, [pathname, searchParams]);

  return null;
}
