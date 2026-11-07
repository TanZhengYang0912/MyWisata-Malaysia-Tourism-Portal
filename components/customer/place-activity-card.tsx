import Link from "next/link";
import type { ReactNode } from "react";
import { LocalizedContentHeading } from "@/components/customer/localized-content";
import type { PublicTranslationEntity, PublicTranslationField } from "@/lib/content-translations/contract";

type PlaceActivityCardProps = {
  href?: string;
  imageUrl: string | null;
  imageAlt: string;
  imageFallback: ReactNode;
  badge: ReactNode;
  title: string;
  titleTranslation?: { entityType: PublicTranslationEntity; entityId: string; field: PublicTranslationField; sourceText: string };
  supportingText?: ReactNode;
  price: ReactNode;
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
  titleTranslation,
  supportingText,
  price,
  footer,
  action,
}: PlaceActivityCardProps) {
  const media = (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={imageAlt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover/place-media:scale-105" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">{imageFallback}</div>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
        {badge}
      </span>
    </>
  );

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:flex-row">
      {href ? (
        <Link href={href} className="group/place-media relative block aspect-[4/3] shrink-0 overflow-hidden bg-primary/10 sm:aspect-auto sm:w-[35%] lg:w-[40%]">
          {media}
        </Link>
      ) : (
        <div className="relative block aspect-[4/3] shrink-0 overflow-hidden bg-primary/10 sm:aspect-auto sm:w-[35%] lg:w-[40%]">
          {media}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titleTranslation ? (
              <LocalizedContentHeading
                {...titleTranslation}
                href={href}
                linkClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:text-primary"
                headingClassName="break-words whitespace-normal text-lg font-bold leading-tight text-foreground"
              />
            ) : href ? (
              <Link href={href} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:text-primary"><h3 className="break-words whitespace-normal text-lg font-bold leading-tight text-foreground">{title}</h3></Link>
            ) : <h3 className="break-words whitespace-normal text-lg font-bold leading-tight text-foreground">{title}</h3>}
            {supportingText && <p className="mt-1 break-words whitespace-normal text-xs font-semibold text-primary">{supportingText}</p>}
          </div>
          <div className="shrink-0 text-right text-sm font-bold text-foreground">{price}</div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
          <span className="break-words whitespace-normal text-xs font-semibold text-muted-foreground">{footer}</span>
          {action}
        </div>
      </div>
    </article>
  );
}
