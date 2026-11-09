"use client";

import { useState } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EnlargeableQrCodeProps {
  src: string;
  alt: string;
}

export function EnlargeableQrCode({ src, alt }: EnlargeableQrCodeProps) {
  const { t } = useTranslation("customer");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={`${t("ui.booking.qrEnlargeAction")} ${alt}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="group flex w-full min-w-0 flex-col items-center gap-1 rounded-lg p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Image src={src} alt={alt} width={512} height={512} unoptimized className="aspect-square w-full rounded-lg bg-white object-contain" />
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-primary transition-colors group-hover:text-primary/75">
          <Expand size={11} aria-hidden="true" />
          {t("ui.booking.qrEnlargeAction")}
        </span>
      </button>
      <DialogContent className="max-w-[min(26rem,calc(100vw-2rem))] rounded-3xl p-4 sm:p-6">
        <DialogHeader className="pr-8 text-center sm:text-center">
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription className="sr-only">{t("ui.booking.qrEnlargeDescription")}</DialogDescription>
        </DialogHeader>
        <Image
          src={src}
          alt={alt}
          width={512}
          height={512}
          unoptimized
          className="mx-auto aspect-square max-h-[min(70vh,24rem)] w-full max-w-[min(70vh,24rem)] rounded-2xl bg-white p-2 object-contain shadow-sm"
        />
      </DialogContent>
    </Dialog>
  );
}
