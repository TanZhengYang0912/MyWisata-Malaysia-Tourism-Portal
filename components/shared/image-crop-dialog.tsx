"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import NextImage from "next/image";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getDocumentCaptureTemplate } from "@/lib/kyc/document-capture";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IMAGE_SHAPES, croppedFileName, croppedOutputSize, croppedOutputType, isValidNonOverlappingCropPair, needsCrop, type ImageShape } from "@/lib/media/image-aspect";

type CropRequest = { url: string; file: File; shape: ImageShape; resolve: (file: File | null) => void };
type TwoSideCropRequest = { url: string; file: File; width: number; height: number; resolve: (files: { front: File; back: File } | null) => void };

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function exportCrop(request: CropRequest, area: Area): Promise<File> {
  const image = await loadImage(request.url);
  const size = croppedOutputSize(area);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size.width, size.height);
  const type = croppedOutputType(request.file.type);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error("crop_failed");
  return new File([blob], croppedFileName(request.file.name, type), { type, lastModified: Date.now() });
}

async function exportDocumentSide(request: TwoSideCropRequest, area: Area, side: "front" | "back"): Promise<File> {
  const image = await loadImage(request.url);
  const size = croppedOutputSize(area);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob || blob.size === 0 || blob.size > 5 * 1024 * 1024) throw new Error("crop_failed");
  return new File([blob], `kyc-${side}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * `cropToShape(file, shape)` resolves with the file unchanged when it already fits the shape,
 * otherwise opens the crop dialog and resolves with the cropped file, or null if cancelled.
 * Render `cropDialog` once in the uploader.
 */
export function useImageCrop() {
  const [request, setRequest] = useState<CropRequest | null>(null);
  const [twoSideRequest, setTwoSideRequest] = useState<TwoSideCropRequest | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => { cleanupRef.current?.(); cleanupRef.current = null; }, []);

  const cropToShape = useCallback(async (file: File, shape: ImageShape): Promise<File | null> => {
    const url = URL.createObjectURL(file);
    let image: HTMLImageElement;
    try {
      image = await loadImage(url);
    } catch {
      // Not decodable here (e.g. HEIC): upload as-is and let the server's type check decide.
      URL.revokeObjectURL(url);
      return file;
    }
    if (!needsCrop(image.naturalWidth, image.naturalHeight, shape)) {
      URL.revokeObjectURL(url);
      return file;
    }
    return new Promise<File | null>((resolve) => {
      cleanupRef.current = () => { URL.revokeObjectURL(url); resolve(null); };
      setRequest({ url, file, shape, resolve });
    });
  }, []);

  const cropToTwoDocumentSides = useCallback(async (file: File): Promise<{ front: File; back: File } | null> => {
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return null;
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      if (image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error("image_too_large");
      return await new Promise((resolve) => {
        cleanupRef.current = () => { URL.revokeObjectURL(url); resolve(null); };
        setTwoSideRequest({ url, file, width: image.naturalWidth, height: image.naturalHeight, resolve });
      });
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }, []);

  const finish = (result: File | null) => {
    if (!request) return;
    cleanupRef.current = null;
    URL.revokeObjectURL(request.url);
    request.resolve(result);
    setRequest(null);
  };

  const finishTwoSide = (files: { front: File; back: File } | null) => {
    if (!twoSideRequest) return;
    cleanupRef.current = null;
    URL.revokeObjectURL(twoSideRequest.url);
    twoSideRequest.resolve(files);
    setTwoSideRequest(null);
  };

  const cropDialog = request
    ? <ImageCropDialog key={request.url} request={request} onDone={finish} />
    : twoSideRequest ? <TwoSideImageCropDialog key={twoSideRequest.url} request={twoSideRequest} onDone={finishTwoSide} /> : null;
  return { cropToShape, cropToTwoDocumentSides, cropDialog };
}

function ImageCropDialog({ request, onDone }: { request: CropRequest; onDone: (file: File | null) => void }) {
  const { t } = useTranslation("common");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const shape = IMAGE_SHAPES[request.shape];

  async function confirm() {
    if (!area) return;
    setBusy(true);
    setFailed(false);
    try {
      onDone(await exportCrop(request, area));
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onDone(null); }}>
      <DialogContent className="sm:max-w-xl" data-image-crop-dialog={request.shape}>
        <DialogHeader>
          <DialogTitle>{t("imageCrop.title")}</DialogTitle>
          <DialogDescription>{t("imageCrop.description", { shape: shape.label })}</DialogDescription>
        </DialogHeader>
        <div className="relative h-72 overflow-hidden rounded-xl bg-muted sm:h-80">
          <Cropper image={request.url} crop={crop} zoom={zoom} aspect={shape.ratio} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} />
        </div>
        <label className="flex items-center gap-3 text-sm font-medium text-foreground">
          {t("imageCrop.zoom")}
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={busy} className="flex-1 accent-primary" />
        </label>
        {failed && <p role="alert" className="text-sm text-destructive">{t("imageCrop.failed")}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(null)} disabled={busy}>{t("actions.cancel")}</Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !area}>{busy ? t("states.processingEllipsis") : t("imageCrop.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TwoSideImageCropDialog({ request, onDone }: { request: TwoSideCropRequest; onDone: (files: { front: File; back: File } | null) => void }) {
  const { t } = useTranslation("common");
  const [step, setStep] = useState<"front" | "back" | "review">("front");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [frontArea, setFrontArea] = useState<Area | null>(null);
  const [backArea, setBackArea] = useState<Area | null>(null);
  const [files, setFiles] = useState<{ front: File; back: File } | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{ front: string; back: string } | null>(null);
  const previewUrlsRef = useRef<{ front: string; back: string } | null>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => {
    mountedRef.current = false;
    const urls = previewUrlsRef.current;
    if (urls) { URL.revokeObjectURL(urls.front); URL.revokeObjectURL(urls.back); }
    previewUrlsRef.current = null;
  }, []);
  const area = step === "front" ? frontArea : backArea;
  const aspect = getDocumentCaptureTemplate("national_id").aspectRatio;

  function clearPreview() {
    if (previewUrls) {
      URL.revokeObjectURL(previewUrls.front);
      URL.revokeObjectURL(previewUrls.back);
      previewUrlsRef.current = null;
      setPreviewUrls(null);
    }
    setFiles(null);
  }

  function closeWithResult(result: { front: File; back: File } | null) {
    if (previewUrls) {
      URL.revokeObjectURL(previewUrls.front);
      URL.revokeObjectURL(previewUrls.back);
      previewUrlsRef.current = null;
    }
    onDone(result);
  }

  async function advance() {
    if (step === "front") { setStep("back"); setCrop({ x: 0, y: 0 }); setZoom(1); return; }
    if (step === "back") {
      if (!frontArea || !backArea || !isValidNonOverlappingCropPair(frontArea, backArea, request.width, request.height)) { setFailed(true); return; }
      setBusy(true);
      try {
        const output = { front: await exportDocumentSide(request, frontArea, "front"), back: await exportDocumentSide(request, backArea, "back") };
        if (!mountedRef.current) return;
        setFiles(output);
        const urls = { front: URL.createObjectURL(output.front), back: URL.createObjectURL(output.back) };
        previewUrlsRef.current = urls;
        setPreviewUrls(urls);
        setStep("review");
        setFailed(false);
      } catch { setFailed(true); }
      finally { setBusy(false); }
    }
  }

  function edit(side: "front" | "back") {
    clearPreview();
    setStep(side);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  function swapSides() {
    if (!frontArea || !backArea || !files || !previewUrls) return;
    setFrontArea(backArea);
    setBackArea(frontArea);
    setFiles({ front: files.back, back: files.front });
    setPreviewUrls({ front: previewUrls.back, back: previewUrls.front });
  }

  const title = step === "review" ? t("imageCrop.reviewSides") : t(step === "front" ? "imageCrop.selectFront" : "imageCrop.selectBack");
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) closeWithResult(null); }}>
      <DialogContent className="sm:max-w-2xl" data-image-crop-dialog="document-sides">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("imageCrop.twoSidesDescription")}</DialogDescription></DialogHeader>
        {step === "review" && previewUrls ? <div className="grid gap-4 sm:grid-cols-2">
          {(["front", "back"] as const).map((side) => <figure key={side} className="space-y-2">
            <figcaption className="text-sm font-medium">{t(side === "front" ? "imageCrop.front" : "imageCrop.back")}</figcaption>
            {/* These previews are local object URLs and are revoked when adjusted or closed. */}
            <NextImage src={previewUrls[side]} alt={t(side === "front" ? "imageCrop.front" : "imageCrop.back")} width={480} height={270} unoptimized className="max-h-56 w-full rounded-lg border object-contain" />
          </figure>)}
        </div> : <>
          <div className="relative h-72 overflow-hidden rounded-xl bg-muted sm:h-80">
            <Cropper image={request.url} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => step === "front" ? setFrontArea(pixels) : setBackArea(pixels)} />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-foreground">{t("imageCrop.zoom")}
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={busy} className="flex-1 accent-primary" />
          </label>
        </>}
        {failed && <p role="alert" className="text-sm text-destructive">{t("imageCrop.twoSidesFailed")}</p>}
        <DialogFooter className="flex-wrap">
          <Button type="button" variant="outline" onClick={() => closeWithResult(null)} disabled={busy}>{t("actions.cancel")}</Button>
          {step === "back" && <Button type="button" variant="outline" onClick={() => edit("front")} disabled={busy}>{t("imageCrop.editFront")}</Button>}
          {step === "review" && <>
            <Button type="button" variant="outline" onClick={swapSides}>{t("imageCrop.swapSides")}</Button>
            <Button type="button" variant="outline" onClick={() => edit("back")}>{t("imageCrop.editBack")}</Button>
            <Button type="button" onClick={() => files && closeWithResult(files)}>{t("imageCrop.confirmBoth")}</Button>
          </>}
          {step !== "review" && <Button type="button" onClick={() => void advance()} disabled={busy || !area}>
            {busy ? t("states.processingEllipsis") : t(step === "front" ? "imageCrop.nextToBack" : "imageCrop.previewBoth")}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImageShapeHint({ shape, className = "text-[11px] text-muted-foreground" }: { shape: ImageShape; className?: string }) {
  const { t } = useTranslation("common");
  const { label, example } = IMAGE_SHAPES[shape];
  return <p className={className}>{t("imageCrop.hint", { shape: label, size: example })}</p>;
}
