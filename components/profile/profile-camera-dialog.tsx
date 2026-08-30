"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  classifyCameraError,
  createCapturedPhotoFile,
  getSquareCrop,
  isCameraOperationCurrent,
  stopCameraStream,
  type CameraErrorCode,
  type CameraFacingMode,
} from "@/lib/profile/camera-capture";

const CAPTURE_SIZE = 720;
const JPEG_QUALITY = 0.9;

type CameraStatus = "idle" | "starting" | "ready" | "captured";

type ProfileCameraDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  onPhotoCaptured(file: File): void;
};

const CAMERA_ERROR_KEYS: Record<CameraErrorCode, string> = {
  unsupported: "ui.profileWizard.cameraUnsupported",
  permission_denied: "ui.profileWizard.cameraPermissionDenied",
  not_found: "ui.profileWizard.cameraNotFound",
  startup_failed: "ui.profileWizard.cameraStartupFailed",
  capture_failed: "ui.profileWizard.cameraCaptureFailed",
};

export function ProfileCameraDialog({ open, onOpenChange, onPhotoCaptured }: ProfileCameraDialogProps) {
  const { t: tCustomer } = useTranslation("customer");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const openRef = useRef(open);
  const capturedPreviewRef = useRef<string | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [activeFacingMode, setActiveFacingMode] = useState<CameraFacingMode>("user");
  const [cameraError, setCameraError] = useState<CameraErrorCode | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);

  const stopActiveCamera = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    stopCameraStream(stream);
  }, []);

  const clearCapturedPhoto = useCallback(() => {
    if (capturedPreviewRef.current) URL.revokeObjectURL(capturedPreviewRef.current);
    capturedPreviewRef.current = null;
    setCapturedPreviewUrl(null);
    setCapturedFile(null);
  }, []);

  const resetDialog = useCallback(() => {
    requestIdRef.current += 1;
    stopActiveCamera();
    clearCapturedPhoto();
    setCameraError(null);
    setActiveFacingMode("user");
    setStatus("idle");
  }, [clearCapturedPhoto, stopActiveCamera]);

  const startCamera = useCallback(async (facingMode: CameraFacingMode) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    stopActiveCamera();
    setCameraError(null);
    setStatus("starting");

    if (
      typeof window === "undefined"
      || !window.isSecureContext
      || typeof navigator === "undefined"
      || !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError("unsupported");
      setStatus("idle");
      return;
    }

    let nextStream: MediaStream | null = null;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
      if (requestId !== requestIdRef.current) {
        stopCameraStream(nextStream);
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stopCameraStream(nextStream);
        setCameraError("startup_failed");
        setStatus("idle");
        return;
      }

      streamRef.current = nextStream;
      video.srcObject = nextStream;
      await video.play();
      if (requestId !== requestIdRef.current) {
        if (streamRef.current === nextStream) streamRef.current = null;
        if (videoRef.current?.srcObject === nextStream) videoRef.current.srcObject = null;
        stopCameraStream(nextStream);
        return;
      }
      setStatus("ready");
    } catch (error) {
      if (streamRef.current === nextStream) streamRef.current = null;
      if (nextStream && videoRef.current?.srcObject === nextStream) videoRef.current.srcObject = null;
      stopCameraStream(nextStream);
      if (!isCameraOperationCurrent(requestId, requestIdRef.current, openRef.current)) return;
      setCameraError(classifyCameraError(error));
      setStatus("idle");
    }
  }, [stopActiveCamera]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Opening the controlled dialog is the external event that starts camera synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera("user");
    return () => {
      requestIdRef.current += 1;
      stopActiveCamera();
    };
  }, [open, startCamera, stopActiveCamera]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    stopActiveCamera();
    if (capturedPreviewRef.current) URL.revokeObjectURL(capturedPreviewRef.current);
  }, [stopActiveCamera]);

  function handleOpenChange(nextOpen: boolean) {
    openRef.current = nextOpen;
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  }

  function switchCamera() {
    const nextFacingMode: CameraFacingMode = activeFacingMode === "user" ? "environment" : "user";
    clearCapturedPhoto();
    setActiveFacingMode(nextFacingMode);
    void startCamera(nextFacingMode);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const captureRequestId = requestIdRef.current;
    const captureStream = streamRef.current;
    if (
      !video
      || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      || video.videoWidth <= 0
      || video.videoHeight <= 0
    ) {
      setCameraError("capture_failed");
      return;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = CAPTURE_SIZE;
      canvas.height = CAPTURE_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("capture_failed");
      const { sx, sy, size } = getSquareCrop(video.videoWidth, video.videoHeight);
      context.drawImage(video, sx, sy, size, size, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (
        !isCameraOperationCurrent(captureRequestId, requestIdRef.current, openRef.current)
        || streamRef.current !== captureStream
      ) return;
      if (!blob) throw new Error("capture_failed");

      clearCapturedPhoto();
      const file = createCapturedPhotoFile(blob);
      const previewUrl = URL.createObjectURL(blob);
      capturedPreviewRef.current = previewUrl;
      setCapturedFile(file);
      setCapturedPreviewUrl(previewUrl);
      setCameraError(null);
      setStatus("captured");
    } catch {
      if (!isCameraOperationCurrent(captureRequestId, requestIdRef.current, openRef.current)) return;
      setCameraError("capture_failed");
    }
  }

  function retakePhoto() {
    clearCapturedPhoto();
    setCameraError(null);
    setStatus(streamRef.current ? "ready" : "idle");
    if (!streamRef.current) void startCamera(activeFacingMode);
  }

  function usePhoto() {
    if (!capturedFile) return;
    const acceptedPhoto = capturedFile;
    requestIdRef.current += 1;
    stopActiveCamera();
    clearCapturedPhoto();
    onPhotoCaptured(acceptedPhoto);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tCustomer("ui.profileWizard.cameraTitle")}</DialogTitle>
          <DialogDescription>{tCustomer("ui.profileWizard.cameraDescription")}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black sm:aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${activeFacingMode === "user" ? "-scale-x-100" : ""}`}
          />
          {capturedPreviewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedPreviewUrl} alt={tCustomer("ui.profileWizard.profilePhoto")} className="absolute inset-0 h-full w-full object-cover" />
          )}
          {status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70 text-sm text-white">
              <Loader2 size={18} className="animate-spin" /> {tCustomer("ui.profileWizard.cameraStarting")}
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-8 text-center text-sm text-white" role="alert">
              {tCustomer(CAMERA_ERROR_KEYS[cameraError])}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {status === "captured" ? (
            <>
              <Button type="button" variant="outline" onClick={retakePhoto}>
                <RefreshCw size={16} /> {tCustomer("ui.profileWizard.cameraRetake")}
              </Button>
              <Button type="button" onClick={usePhoto}>
                {tCustomer("ui.profileWizard.cameraUse")}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={switchCamera} disabled={status === "starting"}>
                <RefreshCw size={16} /> {tCustomer("ui.profileWizard.cameraSwitch")}
              </Button>
              <Button type="button" onClick={() => void capturePhoto()} disabled={status !== "ready"}>
                <Camera size={16} /> {tCustomer("ui.profileWizard.cameraCapture")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
