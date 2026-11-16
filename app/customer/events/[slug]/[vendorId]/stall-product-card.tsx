"use client";

import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CardFrame } from "@/components/customer/card-frame";
import { CARD_PRICE_CLASS, CardPrice } from "@/components/customer/product-card";
import { EventReserveButton } from "@/components/customer/event-reserve-dialog";
import type { PromotionCampaignPublicLocation, PromotionCampaignPublicProduct } from "@/lib/promotion-campaigns/types";

type Props = {
  product: PromotionCampaignPublicProduct;
  registrationId: string;
  location: Pick<PromotionCampaignPublicLocation, "name" | "startsOn" | "endsOn">;
  isEnded: boolean;
};

// Same stretched-link look as CardFrame's title link, on a button: the whole card opens the reserve dialog.
// A button is a block box, so the underline sits on an inline span to follow every line of a wrapped title.
const CARD_BUTTON_CLASS = "group/title cursor-pointer text-left after:absolute after:inset-0 after:z-[1] after:rounded-[6px] after:content-[''] focus-visible:outline-none";
const CARD_UNDERLINE_CLASS = "bg-[linear-gradient(currentColor,currentColor)] bg-[length:0_2px] bg-[position:0_100%] bg-no-repeat transition-[background-size] duration-[250ms] group-hover/title:bg-[length:100%_2px] group-focus-visible/title:bg-[length:100%_2px] motion-reduce:transition-none";
// CardFrame zooms the photo only for link cards; the reserve card asks for the same zoom.
const CARD_ZOOM_CLASS = "[&_img]:transition-transform [&_img]:duration-[450ms] [&_img]:ease-out motion-reduce:[&_img]:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/card:[&_img]:scale-[1.04] motion-reduce:group-hover/card:[&_img]:scale-100";

/** A product at one event stop on the shared CardFrame. Tapping it reserves; at an ended stop it only shows "Ended". */
export function StallProductCard({ product, registrationId, location, isEnded }: Props) {
  const { t } = useTranslation("customer");
  const frame = (title: ReactNode, className: string) => (
    <CardFrame
      imageUrl={product.imageUrl}
      imageAlt={product.name}
      fallback={
        <div className="flex h-full flex-col items-center justify-center bg-secondary text-primary">
          <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
          <span className="mt-2 text-xs font-semibold text-muted-foreground">{t("ui.outlet.photoComingSoon")}</span>
        </div>
      }
      title={title}
      footer={isEnded
        ? <p className={`text-right ${CARD_PRICE_CLASS} !text-muted-foreground`}>{t("ui.reserve.ended")}</p>
        : product.price === 0
          ? <p className={`text-right ${CARD_PRICE_CLASS}`}>{t("ui.reserve.free")}</p>
          : <CardPrice amount={product.price} />}
      className={className}
      data-stall-product={isEnded ? "ended" : "open"}
    />
  );

  if (isEnded) return frame(product.name, "[&_img]:opacity-60");

  return (
    <EventReserveButton
      registrationId={registrationId}
      listingId={product.id}
      itemName={product.name}
      price={product.price}
      locationName={location.name}
      startsOn={location.startsOn}
      endsOn={location.endsOn}
      trigger={(open) => frame(
        <button type="button" data-card-link="" aria-haspopup="dialog" onClick={open} className={CARD_BUTTON_CLASS}><span className={CARD_UNDERLINE_CLASS}>{product.name}</span></button>,
        CARD_ZOOM_CLASS,
      )}
    />
  );
}
