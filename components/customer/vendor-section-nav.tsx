"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Sticky jump links under the customer header; the active link follows the section in view. */
export function VendorSectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  const { t } = useTranslation("customer");
  const [active, setActive] = useState(items[0]?.id);
  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: "-140px 0px -55% 0px" });
    for (const id of ids.split(" ")) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);

  if (items.length < 2) return null;
  return (
    <nav aria-label={t("ui.vendor.sectionNav")} className="sticky top-[var(--customer-header-h,4.25rem)] z-20 -mx-4 mb-8 overflow-x-auto border-b border-border bg-background px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? "true" : undefined}
            onClick={() => setActive(item.id)}
            className={`shrink-0 whitespace-nowrap border-b-[3px] px-3.5 py-3 text-[13px] font-[650] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 ${active === item.id ? "border-highlight-yellow text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
