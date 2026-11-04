import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type BreadcrumbItem = { label: ReactNode; href?: string };

export function Breadcrumbs({ items, label, className = "" }: { items: readonly BreadcrumbItem[]; label: string; className?: string }) {
  if (!items.length) return null;
  return <nav aria-label={label} className={`flex flex-wrap items-center gap-1 text-xs text-muted-foreground ${className}`}>
    {items.map((item, index) => <span key={index} className="inline-flex min-w-0 items-center gap-1 break-words">
      {index > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
      {index === items.length - 1 ? <span aria-current="page" className="font-semibold text-foreground">{item.label}</span>
        : item.href ? <Link href={item.href} className="font-medium hover:text-foreground">{item.label}</Link> : <span>{item.label}</span>}
    </span>)}
  </nav>;
}
