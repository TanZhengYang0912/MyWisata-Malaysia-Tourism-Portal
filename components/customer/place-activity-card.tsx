import Link from "next/link";
import type { ReactNode } from "react";

type PlaceActivityCardProps = {
  href?: string;
  imageUrl: string | null;
  imageAlt: string;
  imageFallback: ReactNode;
  badge: ReactNode;
  title: string;
  supportingText?: ReactNode;
  price: ReactNode;
  description: ReactNode;
  footer: ReactNode;
  action?: ReactNode;
};

/** Shared visual frame; each consumer retains its own commerce semantics. */
export function PlaceActivityCard({
  href,
  imageUrl,
  imageAlt,
  imageFallback,
  badge,
  title,
  supportingText,
  price,
  description,
  footer,
  action,
}: PlaceActivityCardProps) {
  const media = (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={imageAlt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">{imageFallback}</div>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
        {badge}
      </span>
    </>
  );

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md sm:flex-row">
      {href ? (
        <Link href={href} className="relative block aspect-[16/10] shrink-0 overflow-hidden bg-primary/10 sm:aspect-auto sm:w-[35%] lg:w-[40%]">
          {media}
        </Link>
      ) : (
        <div className="relative block aspect-[16/10] shrink-0 overflow-hidden bg-primary/10 sm:aspect-auto sm:w-[35%] lg:w-[40%]">
          {media}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {href ? (
              <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <h3 className="line-clamp-2 text-lg font-bold leading-tight text-foreground transition-colors group-hover:text-primary">{title}</h3>
              </Link>
            ) : (
              <h3 className="line-clamp-2 text-lg font-bold leading-tight text-foreground">{title}</h3>
            )}
            {supportingText && <p className="mt-1 text-xs font-semibold text-primary">{supportingText}</p>}
          </div>
          <div className="shrink-0 text-right text-sm font-bold text-foreground">{price}</div>
        </div>

        <p className="mb-5 mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <span className="text-xs font-semibold text-muted-foreground">{footer}</span>
          {action}
        </div>
      </div>
    </article>
  );
}
