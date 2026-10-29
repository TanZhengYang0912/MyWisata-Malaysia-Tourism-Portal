"use client";

import { useId, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProfileCameraDialog } from "@/components/profile/profile-camera-dialog";
import { useImageCrop } from "@/components/shared/image-crop-dialog";
import { formatAvatarFileSize, validateAvatarFileMetadata } from "@/lib/profile/avatar-validation";

type ProfilePhotoPickerProps = {
  previewUrl?: string | null;
  error?: string | null;
  disabled?: boolean;
  variant: "wizard" | "compact";
  onPhotoSelected(file: File): void;
  onError(message: string | null): void;
};

export function ProfilePhotoPicker({
  previewUrl,
  error,
  disabled = false,
  variant,
  onPhotoSelected,
  onError,
}: ProfilePhotoPickerProps) {
  const { t: tCustomer } = useTranslation("customer");
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const photoDescriptionId = useId();
  const photoErrorId = useId();
  const menuTitleId = useId();
  const menuDescriptionId = useId();
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const { cropToShape, cropDialog } = useImageCrop();

  function showValidationError(reason: "type" | "size", sizeBytes?: number) {
    const key = reason === "type"
      ? "ui.profileWizard.photoTypeValidation"
      : "ui.profileWizard.photoSizeValidation";
    onError(tCustomer(key, reason === "size" && sizeBytes !== undefined
      ? { size: formatAvatarFileSize(sizeBytes) }
      : undefined));
  }

  async function selectPhoto(file: File | null) {
    if (!file) return;
    // Reject unsupported types before cropping, which would otherwise convert them.
    const original = validateAvatarFileMetadata(file);
    if (!original.ok) {
      showValidationError(original.reason, file.size);
      return;
    }
    const cropped = await cropToShape(file, "square");
    if (!cropped) return;
    const validation = validateAvatarFileMetadata(cropped);
    if (!validation.ok) {
      showValidationError(validation.reason, cropped.size);
      return;
    }
    onError(null);
    onPhotoSelected(cropped);
  }

  function openCamera() {
    setSourceMenuOpen(false);
    setCameraOpen(true);
  }

  function handleCameraOpenChange(open: boolean) {
    setCameraOpen(open);
    if (!open) window.requestAnimationFrame(() => pickerButtonRef.current?.focus());
  }

  const photoDescription = tCustomer("ui.profileWizard.photoDescription");
  const photoPicker = (
    <Dialog open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
      <DialogTrigger asChild>
        <button
          ref={pickerButtonRef}
          type="button"
          disabled={disabled}
          aria-label={tCustomer("ui.profileWizard.choosePhoto")}
          aria-haspopup="dialog"
          aria-describedby={error ? `${photoDescriptionId} ${photoErrorId}` : photoDescriptionId}
          className={variant === "wizard"
            ? "flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            : "group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"}
          style={variant === "wizard" ? {
            borderColor: error ? "var(--destructive)" : previewUrl ? "var(--primary)" : "var(--border)",
            backgroundColor: previewUrl ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
          } : undefined}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className={variant === "wizard"
                ? "h-20 w-20 rounded-full border-2 border-primary object-cover"
                : "h-full w-full object-cover"}
            />
          ) : (
            <Camera size={variant === "wizard" ? 24 : 23} className={variant === "wizard" ? "text-muted-foreground" : undefined} />
          )}
          {variant === "wizard" ? (
            <>
              <span className="text-sm text-muted-foreground">{tCustomer("ui.profileWizard.choosePhoto")}</span>
              <span id={photoDescriptionId} className="text-xs text-muted-foreground">{photoDescription}</span>
            </>
          ) : (
            <span id={photoDescriptionId} className="sr-only">{photoDescription}</span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        className="fixed inset-x-0 top-auto bottom-0 left-0 z-50 grid max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl duration-200 md:inset-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-sm md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-2xl md:border-b md:p-6"
        aria-labelledby={menuTitleId}
        aria-describedby={menuDescriptionId}
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle id={menuTitleId}>{tCustomer("ui.profileWizard.photoSourceTitle")}</DialogTitle>
          <DialogDescription id={menuDescriptionId} className="sr-only">
            {tCustomer("ui.profileWizard.photoSourceDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-xl py-4 text-left"
            onClick={() => {
              fileRef.current?.click();
              setSourceMenuOpen(false);
            }}
          >
            <Upload size={19} aria-hidden="true" />
            {tCustomer("ui.profileWizard.choosePhoto")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 rounded-xl py-4 text-left"
            onClick={openCamera}
          >
            <Camera size={19} aria-hidden="true" />
            {tCustomer("ui.profileWizard.takePhoto")}
          </Button>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="w-full sm:w-auto">
              {tCustomer("ui.profileWizard.cancelPhotoSelection")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          void selectPhoto(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {variant === "wizard" ? (
        <div className="space-y-3">
          {photoPicker}
          {error && <p id={photoErrorId} className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="space-y-2">
            {photoPicker}
            <span className="block text-xs text-muted-foreground">{photoDescription}</span>
            {error && <p id={photoErrorId} className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
        </div>
      )}

      <ProfileCameraDialog
        open={cameraOpen}
        onOpenChange={handleCameraOpenChange}
        onPhotoCaptured={(file) => void selectPhoto(file)}
      />
      {cropDialog}
    </>
  );
}
