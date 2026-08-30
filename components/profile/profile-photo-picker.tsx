"use client";

import { useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ProfileCameraDialog } from "@/components/profile/profile-camera-dialog";
import { validateAvatarFileMetadata } from "@/lib/profile/avatar-validation";

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
  const [cameraOpen, setCameraOpen] = useState(false);

  function selectPhoto(file: File | null) {
    if (!file) return;
    const validation = validateAvatarFileMetadata(file);
    if (!validation.ok) {
      onError(tCustomer(validation.reason === "type"
        ? "ui.profileWizard.photoTypeValidation"
        : "ui.profileWizard.photoSizeValidation"));
      return;
    }
    onError(null);
    onPhotoSelected(file);
  }

  const actions = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          selectPhoto(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={disabled}>
        <Upload size={16} /> {tCustomer("ui.profileWizard.uploadPhoto")}
      </Button>
      <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} disabled={disabled}>
        <Camera size={16} /> {tCustomer("ui.profileWizard.takePhoto")}
      </Button>
    </div>
  );

  return (
    <>
      {variant === "wizard" ? (
        <div className="space-y-3">
          <div
            className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors"
            style={{
              borderColor: error ? "var(--destructive)" : previewUrl ? "var(--primary)" : "var(--border)",
              backgroundColor: previewUrl ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
            }}
          >
            {previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={tCustomer("ui.profileWizard.profilePhoto")} className="h-20 w-20 rounded-full border-2 border-primary object-cover" />
                <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.choosePhoto")}</p>
              </>
            ) : (
              <>
                <Camera size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tCustomer("ui.profileWizard.choosePhoto")}</p>
              </>
            )}
          </div>
          {actions}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={tCustomer("ui.profileWizard.profilePhoto")} className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Camera size={23} />
            </div>
          )}
          <div className="space-y-2">
            {actions}
            {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          </div>
        </div>
      )}

      <ProfileCameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onPhotoCaptured={selectPhoto}
      />
    </>
  );
}
