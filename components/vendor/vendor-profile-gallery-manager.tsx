'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Images, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MAX_VENDOR_GALLERY_IMAGES, validateVendorGalleryFiles } from '@/lib/vendor/gallery-files';
import { vendorImageUrl } from '@/lib/storage/vendor-image';

type GalleryPhoto = { id?: string; url: string; altText?: string | null; sortOrder?: number | null };

interface Props { vendorId: string }

export default function VendorProfileGalleryManager({ vendorId }: Props) {
  const { t } = useTranslation('vendor');
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loadedVendorId, setLoadedVendorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  useEffect(() => {
    let active = true;
    fetch(`/api/vendors/${vendorId}/media/gallery`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || t('ui.profile.galleryLoadFailed'));
        if (active) setPhotos(payload.data as GalleryPhoto[]);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : t('ui.profile.galleryLoadFailed'));
      })
      .finally(() => { if (active) setLoadedVendorId(vendorId); });
    return () => { active = false; };
  }, [t, vendorId]);

  const loading = loadedVendorId !== vendorId;

  function selectFiles(list: FileList | null) {
    const nextFiles = Array.from(list ?? []);
    if (!nextFiles.length) return;
    const validation = validateVendorGalleryFiles(nextFiles, { allowEmpty: false });
    if (!validation.ok) {
      const messageKey = validation.reason === 'count'
        ? 'ui.profile.galleryCountError'
        : validation.reason === 'type'
          ? 'ui.profile.galleryImageTypeError'
          : 'ui.profile.galleryImageSizeError';
      setSelectionError(t(messageKey));
      return;
    }
    setSelectionError(null);
    setFiles(nextFiles);
    setMessage(null);
    setError(null);
  }

  async function replaceGallery() {
    if (files.length !== MAX_VENDOR_GALLERY_IMAGES) {
      setSelectionError(t('ui.profile.galleryCountError'));
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    files.forEach((file) => formData.append('galleryFiles', file));
    try {
      const response = await fetch(`/api/vendors/${vendorId}/media/gallery`, { method: 'PUT', body: formData });
      const payload = await response.json();
      if (!response.ok) {
        const messageKey = payload.error?.code === 'INVALID_GALLERY_COUNT'
          ? 'ui.profile.galleryCountError'
          : payload.error?.code === 'INVALID_IMAGE_TYPE'
            ? 'ui.profile.galleryImageTypeError'
            : payload.error?.code === 'IMAGE_TOO_LARGE'
              ? 'ui.profile.galleryImageSizeError'
              : payload.error?.code === 'GALLERY_STATUS_UNCONFIRMED'
                ? 'ui.profile.galleryStatusUnconfirmed'
              : 'ui.profile.galleryUpdateFailed';
        throw new Error(t(messageKey));
      }
      setPhotos(payload.data.items as GalleryPhoto[]);
      setFiles([]);
      setSelectionError(null);
      setMessage(payload.data.cleanupWarning ? t('ui.profile.galleryCleanupWarning') : t('ui.profile.gallerySaved'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('ui.profile.galleryUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function clearGallery() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/media/gallery`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(t('ui.profile.galleryClearFailed'));
      setPhotos([]);
      setFiles([]);
      setConfirmClear(false);
      setMessage(payload.data.cleanupWarning ? t('ui.profile.galleryCleanupWarning') : t('ui.profile.galleryCleared'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('ui.profile.galleryClearFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="vendor-gallery-heading" aria-busy={saving || loading} className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3 border-b border-gray-100 pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Images size={19} /></div>
        <div className="min-w-0 flex-1">
          <h2 id="vendor-gallery-heading" className="text-base font-bold text-gray-950">{t('ui.profile.galleryTitle')}</h2>
          <p className="mt-1 text-sm leading-5 text-gray-500">{t('ui.profile.galleryDescription')}</p>
        </div>
        {photos.length > 0 && <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">{photos.length}/3</span>}
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-primary/20 bg-secondary px-4 py-3 text-sm text-primary">{message}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">{t('ui.profile.loading')}</p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label={t('ui.profile.galleryChoose')}
            className="sr-only"
            disabled={saving}
            onChange={(event) => { selectFiles(event.target.files); event.target.value = ''; }}
          />

          {files.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {files.map((file, index) => (
                <figure key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrls[index]} alt={t('ui.profile.galleryPreviewAlt', { number: index + 1 })} className="aspect-[4/3] w-full object-cover" />
                  <figcaption className="truncate px-2.5 py-2 text-xs text-gray-500">{file.name}</figcaption>
                </figure>
              ))}
            </div>
          ) : photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo, index) => (
                <figure key={photo.id || photo.url} className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={vendorImageUrl(photo.url) || photo.url} alt={photo.altText || t('ui.profile.galleryPreviewAlt', { number: index + 1 })} className="aspect-[4/3] w-full object-cover" />
                  <figcaption className="px-2.5 py-2 text-xs text-gray-500">{t('ui.profile.galleryPreviewAlt', { number: index + 1 })}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-4">
              <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary"><Images size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{t('ui.profile.galleryEmpty')}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{t('ui.profile.galleryEmptyDescription')}</p>
              </div>
            </div>
          )}

          <p className="text-xs leading-5 text-gray-500">{files.length ? t('ui.profile.gallerySelectedCount', { count: files.length }) : t('ui.profile.galleryHelp')}</p>
          {selectionError && <p role="alert" className="text-xs font-medium text-red-700">{selectionError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={saving}>
              {photos.length || files.length ? <RefreshCw aria-hidden="true" /> : <FileUp aria-hidden="true" />}
              {photos.length || files.length ? t('ui.profile.galleryReplace') : t('ui.profile.galleryChoose')}
            </Button>
            {files.length > 0 && (
              <Button type="button" onClick={() => void replaceGallery()} disabled={saving || files.length !== MAX_VENDOR_GALLERY_IMAGES}>
                {saving && <Loader2 className="animate-spin" aria-hidden="true" />}{saving ? t('ui.profile.gallerySaving') : t('ui.profile.gallerySave')}
              </Button>
            )}
            {photos.length > 0 && !confirmClear && (
              <Button type="button" variant="ghost" onClick={() => setConfirmClear(true)} disabled={saving}>
                <Trash2 aria-hidden="true" />{t('ui.profile.galleryClear')}
              </Button>
            )}
          </div>

          {confirmClear && (
            <div role="alertdialog" aria-labelledby="vendor-gallery-clear-title" aria-describedby="vendor-gallery-clear-description" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 id="vendor-gallery-clear-title" className="text-sm font-bold text-gray-900">{t('ui.profile.galleryClearTitle')}</h3>
              <p id="vendor-gallery-clear-description" className="mt-1 text-sm leading-5 text-gray-600">{t('ui.profile.galleryClearDescription')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmClear(false)} disabled={saving}>{t('ui.profile.galleryCancelClear')}</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => void clearGallery()} disabled={saving}>
                  {saving && <Loader2 className="animate-spin" aria-hidden="true" />}{t('ui.profile.galleryConfirmClear')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
