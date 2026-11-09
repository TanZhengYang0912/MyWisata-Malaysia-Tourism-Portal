"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createCapturedDocumentFile, drawDocumentCapture, getDocumentCaptureTemplate, classifyCameraError, isCameraOperationCurrent, stopCameraStream } from '@/lib/kyc/document-capture';
import { createDocumentQualityChecker, getDocumentQualityPreviewDimensions, type DocumentQualityResult } from '@/lib/kyc/document-quality';
import type { KycDocumentType } from '@/lib/kyc/document-policy';

type CameraCode = 'unsupported' | 'permission_denied' | 'not_found' | 'startup_failed' | 'capture_failed';
const errorKey: Record<CameraCode, string> = {
  unsupported: 'ui.kyc.cameraUnsupported', permission_denied: 'ui.kyc.cameraPermissionDenied', not_found: 'ui.kyc.cameraNotFound',
  startup_failed: 'ui.kyc.cameraStartupFailed', capture_failed: 'ui.kyc.cameraCaptureFailed',
};

export function KycDocumentCameraDialog({ open, documentType, qualityMode='off', onOpenChange, onAccept }: {
  open: boolean; documentType: KycDocumentType; qualityMode?: 'off'|'advisory'; onOpenChange(open: boolean): void; onAccept(file: File): void;
}) {
  const { t } = useTranslation('customer');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<string | null>(null);
  const checkerRef = useRef(createDocumentQualityChecker());
  const requestRef = useRef(0);
  const openRef = useRef(open);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<DocumentQualityResult | null>(null);
  const [error, setError] = useState<CameraCode | null>(null);

  const stop = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  const clear = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setFile(null);
    setQuality(null);
  }, []);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = ++requestRef.current;
    let active = true;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError('unsupported'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (!active || !isCameraOperationCurrent(id, requestRef.current, openRef.current)) { stopCameraStream(stream); return; }
        const video = videoRef.current;
        if (!video) { stopCameraStream(stream); setError('startup_failed'); return; }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        if (!active || !isCameraOperationCurrent(id, requestRef.current, openRef.current)) { stop(); return; }
        setReady(true);
        setError(null);
      } catch (cause) {
        if (active && isCameraOperationCurrent(id, requestRef.current, openRef.current)) setError(classifyCameraError(cause) as CameraCode);
      }
    })();
    return () => { active = false; requestRef.current += 1; stop(); };
  }, [open, stop]);
  useEffect(() => () => { requestRef.current += 1; stop(); checkerRef.current.dispose(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, [stop]);

  async function capture() {
    const video = videoRef.current;
    const id = requestRef.current;
    const currentStream = streamRef.current;
    if (!video || !currentStream || video.videoWidth <= 0 || video.videoHeight <= 0) { setError('capture_failed'); return; }
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      drawDocumentCapture(canvas.getContext('2d') as CanvasRenderingContext2D, video, video.videoWidth, video.videoHeight);
      const dims = getDocumentQualityPreviewDimensions(canvas.width, canvas.height);
      let result: DocumentQualityResult | null = null;
      if (qualityMode==='advisory'&&dims) {
        const check = document.createElement('canvas'); check.width = dims.width; check.height = dims.height;
        const context = check.getContext('2d', { willReadFrequently: true });
        if (context) { context.drawImage(canvas, 0, 0, dims.width, dims.height); result = await checkerRef.current.check(() => context.getImageData(0, 0, dims.width, dims.height)); }
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob || id !== requestRef.current || streamRef.current !== currentStream) throw new Error('capture_failed');
      const next = createCapturedDocumentFile(blob);
      clear();
      const url = URL.createObjectURL(blob); previewRef.current = url;
      setFile(next); setPreviewUrl(url); setQuality(qualityMode==='advisory'?(result ?? { status: 'unknown', reasons: ['unsupported'] }):null); setError(null);
    } catch { setError('capture_failed'); }
    finally { setCapturing(false); }
  }

  function retake() {
    clear(); checkerRef.current = createDocumentQualityChecker();
    setError(null);
    if (!streamRef.current) onOpenChange(false);
  }

  function accept() {
    if (!file) return;
    const accepted = file;
    requestRef.current += 1; stop(); clear(); onAccept(accepted); onOpenChange(false);
  }

  const ratio = getDocumentCaptureTemplate(documentType).aspectRatio;
  return <Dialog open={open} onOpenChange={(next) => { if (!next) { requestRef.current += 1; stop(); clear(); } onOpenChange(next); }}>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>{t('ui.kyc.cameraTitle')}</DialogTitle><DialogDescription>{t('ui.kyc.cameraGuide')}</DialogDescription></DialogHeader>
      <div className="relative mx-auto w-full max-h-[55vh] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: String(ratio) }}>
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-contain" />
        {ready && !previewUrl && <div aria-hidden="true" className="pointer-events-none absolute inset-[8%] rounded-lg border-2 border-dashed border-white/80" />}
        {previewUrl && <>{/* Local capture blobs must not go through an image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={t('ui.kyc.cameraPreview')} className="absolute inset-0 h-full w-full object-contain" /></>}
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="animate-spin" /> {t('ui.kyc.cameraStarting')}</div>}
        {error && <div role="alert" className="absolute inset-0 flex items-center justify-center bg-black/75 p-8 text-center text-white">{t(errorKey[error])}</div>}
      </div>
      {quality && <p role="status" className="text-sm text-muted-foreground">{t(quality.status === 'warn' ? 'ui.kyc.cameraQualityHint' : quality.status === 'unknown' ? 'ui.kyc.cameraQualityUnknown' : 'ui.kyc.cameraQualityAdvisory')}</p>}
      <DialogFooter className="sm:justify-between">
        {file ? <><Button type="button" variant="outline" onClick={retake}><RefreshCw size={16} /> {t('ui.kyc.cameraRetake')}</Button><Button type="button" onClick={accept}>{t('ui.kyc.cameraUse')}</Button></>
          : <Button type="button" onClick={() => void capture()} disabled={!ready || capturing}>{capturing ? <Loader2 className="animate-spin" /> : <Camera size={16} />} {t('ui.kyc.cameraCapture')}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
