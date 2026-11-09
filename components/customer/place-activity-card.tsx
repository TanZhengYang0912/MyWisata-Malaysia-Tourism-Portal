"use client";

import type { ReactNode } from "react";
import { CardFrame } from "@/components/customer/card-frame";
import { LocalizedContent } from "@/components/customer/localized-content";
import type { PublicTranslationEntity } from "@/lib/content-translations/contract";

type PlaceActivityCardProps = {
  /** Only bookable products link; free and official items are not clickable. */
  href?: string;
  imageUrl: string | null;
  imageAlt: string;
  imageFallback: ReactNode;
  /** A static tag on the photo (e.g. Free Entry) for items with no detail page. */
  tag?: ReactNode;
  actions?: ReactNode;
  rating?: ReactNode;
  meta?: ReactNode;
  title: string;
  description: string;
  /** Title and description are translated when the entity supports it. */
  translation?: { entityType: PublicTranslationEntity; entityId: string; titleField: "name" | "title" };
  footer: ReactNode;
};

/** The Place page variant of the shared card: photo left (45%, 4:3) from md up, stacked on phones, full description. */
export function PlaceActivityCard({ translation, title, description, ...props }: PlaceActivityCardProps) {
  const card = (text: string, control?: ReactNode, body: ReactNode = description) => (
    <CardFrame
      layout="place"
      href={props.href}
      imageUrl={props.imageUrl}
      imageAlt={props.imageAlt}
      fallback={<div className="flex h-full w-full items-center justify-center bg-primary/10">{props.imageFallback}</div>}
      topLeft={props.tag && <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-[10px] font-bold text-primary">{props.tag}</span>}
      actions={props.actions}
      rating={props.rating}
      meta={props.meta}
      title={text}
      titleControl={control}
      description={body}
      footer={props.footer}
    />
  );

  if (!translation) return card(title);
  return (
    <LocalizedContent entityType={translation.entityType} entityId={translation.entityId} field={translation.titleField} sourceText={title}>
      {({ text, control }) => card(text, control, <LocalizedContent entityType={translation.entityType} entityId={translation.entityId} field="description" sourceText={description} />)}
    </LocalizedContent>
  );
}
