'use client';

import { useEffect, useMemo, useRef } from 'react';
import { FileUp, Images, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MAX_VENDOR_GALLERY_IMAGES, validateVendorGalleryFiles } from '@/lib/vendor/gallery-files';

interface Props {
  id: string;
  label: string;
  files: File[];
  disabled?: boolean;
  error?: string | null;
  onFilesChange: (files: File[]) => void;
  onError: (message: string | null) => void;
}

export default function VendorRegistrationGalleryField({
  id,
  label,
  files,
  disabled = false,
  error,
  onFilesChange,
  onError,
}: Props) {
  const { t } = useTranslation('vendor');
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  function selectFiles(list: FileList | readonly File[] | null) {
    const nextFiles = Array.from(list ?? []);
    if (!nextFiles.length) return;

    const validation = validateVendorGalleryFiles(nextFiles, { allowEmpty: false });
    if (!validation.ok) {
      const messageKey = validation.reason === 'count'
        ? 'registration.gallery.invalidCount'
        : validation.reason === 'type'
          ? 'registration.gallery.invalidType'
          : 'registration.gallery.tooLarge';
      onError(t(messageKey));
      return;
    }

    onError(null);
    onFilesChange(nextFiles);
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      className={`rounded-xl border border-dashed p-3 transition-colors ${error ? 'border-destructive/50 bg-destructive/[0.03]' : 'border-border bg-background hover:border-primary/30'}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        selectFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          selectFiles(event.target.files);
          event.target.value = '';
        }}
      />

      {files.length ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {files.map((file, index) => (
              <figure key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrls[index]} alt={t('registration.gallery.previewAlt', { number: index + 1 })} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">{file.name}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('registration.gallery.selectedCount', { count: files.length, total: MAX_VENDOR_GALLERY_IMAGES })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
                <RefreshCw aria-hidden="true" /> {t('registration.images.replace')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { onFilesChange([]); onError(null); }}
                disabled={disabled}
                aria-label={t('registration.gallery.removeSelection')}
              >
                <Trash2 aria-hidden="true" /> {t('registration.images.remove')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 items-center gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Images size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t('registration.gallery.emptyTitle')}</p>
            <p id={`${id}-help`} className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('registration.gallery.help', { count: MAX_VENDOR_GALLERY_IMAGES })}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <FileUp aria-hidden="true" /> {t('registration.gallery.choose')}
          </Button>
        </div>
      )}

      {files.length > 0 && <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-foreground">{t('registration.gallery.help', { count: MAX_VENDOR_GALLERY_IMAGES })}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
