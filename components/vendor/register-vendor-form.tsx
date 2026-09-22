'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Image as ImageIcon, Loader2, Store } from 'lucide-react';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import VendorRegistrationImageField from '@/components/vendor/vendor-registration-image-field';
import VendorRegistrationGalleryField from '@/components/vendor/vendor-registration-gallery-field';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isVendorRegisterValidationKey, vendorRegisterSchema, type VendorRegister } from '@/lib/validation/vendor-schemas';

interface Props {
  onClose?: () => void;
}

export default function RegisterVendorForm({ onClose }: Props) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [logoFileError, setLogoFileError] = useState<string | null>(null);
  const [coverFileError, setCoverFileError] = useState<string | null>(null);
  const [galleryFilesError, setGalleryFilesError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VendorRegister>({
    resolver: zodResolver(vendorRegisterSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  function validationMessage(message: string | undefined) {
    return isVendorRegisterValidationKey(message) ? t(message) : message;
  }

  function renderFieldError(id: string, message: string | undefined) {
    if (!message) return null;
    return (
      <p id={id} role="alert" className="mt-2 text-xs font-medium text-destructive">
        {validationMessage(message)}
      </p>
    );
  }

  async function onSubmit(data: VendorRegister) {
    setServerError(null);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) formData.append(key, String(value));
      });
      if (logoFile) formData.append('logoFile', logoFile);
      if (coverFile) formData.append('coverFile', coverFile);
      galleryFiles.forEach((file) => formData.append('galleryFiles', file));

      const res = await fetch('/api/vendors', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        const imageErrors: Record<string, string> = {
          INVALID_IMAGE_TYPE: t('registration.errors.invalidImageType'),
          IMAGE_TOO_LARGE: t('registration.errors.imageTooLarge'),
          INVALID_IMAGE_CONTENT: t('registration.errors.invalidImage'),
          IMAGE_UPLOAD_FAILED: t('registration.errors.imageUploadFailed'),
          IMAGE_CLEANUP_FAILED: t('registration.errors.imageCleanupFailed'),
          INVALID_GALLERY_COUNT: t('registration.gallery.invalidCount'),
          REGISTRATION_STATUS_UNCONFIRMED: t('registration.errors.statusUnconfirmed'),
        };
        const message = imageErrors[result.error?.code] ?? result.error?.message ?? t('registration.errors.failed');
        setServerError(message);
        showFeedback('error', message);
        return;
      }

      showFeedback('success', t('registration.success'));
      router.refresh();
      onClose?.();
    } catch {
      setServerError(t('registration.errors.network'));
      showFeedback('error', t('registration.errors.retry'));
    }
  }

  const labelClass = 'mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-foreground';
  const optionalClass = 'shrink-0 text-[11px] font-medium text-muted-foreground';
  const inputClass = 'h-11 rounded-xl border-border bg-background px-3.5 text-sm shadow-sm shadow-slate-950/[0.02] focus-visible:ring-primary/20';
  const textareaClass = 'min-h-28 resize-y rounded-xl border-border bg-background px-3.5 py-3 text-sm shadow-sm shadow-slate-950/[0.02] focus-visible:ring-primary/20';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" aria-busy={isSubmitting} noValidate>
      {serverError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
          {serverError}
        </div>
      )}

      <section aria-labelledby="business-profile-heading" className="space-y-5">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/25 text-primary">
            <Store size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 id="business-profile-heading" className="text-base font-bold tracking-tight text-foreground">
              {t('registration.sections.businessProfile')}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t('registration.sections.businessProfileDescription')}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="business-name" className={labelClass}>
            <span>{t('registration.fields.businessName')}</span>
            <span className="shrink-0 text-[11px] font-semibold text-primary">{t('registration.required')}</span>
          </label>
          <Input
            id="business-name"
            {...register('name')}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'business-name-error' : undefined}
            placeholder={t('registration.placeholders.businessName')}
            className={inputClass}
          />
          {renderFieldError('business-name-error', errors.name?.message)}
        </div>

        <div>
          <label htmlFor="business-description" className={labelClass}>
            <span>{t('registration.fields.description')}</span>
            <span className={optionalClass}>{t('registration.optional')}</span>
          </label>
          <Textarea
            id="business-description"
            {...register('description')}
            rows={4}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? 'business-description-error' : undefined}
            placeholder={t('registration.placeholders.description')}
            className={textareaClass}
          />
          {renderFieldError('business-description-error', errors.description?.message)}
        </div>

        <div>
          <label htmlFor="business-type" className={labelClass}>
            <span>{t('registration.fields.businessType')}</span>
            <span className={optionalClass}>{t('registration.optional')}</span>
          </label>
          <select
            id="business-type"
            {...register('businessType')}
            aria-invalid={Boolean(errors.businessType)}
            aria-describedby={errors.businessType ? 'business-type-error' : undefined}
            className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground shadow-sm shadow-slate-950/[0.02] outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/20"
          >
            <option value="">{t('registration.options.selectType')}</option>
            <option value="restaurant">{t('registration.options.restaurant')}</option>
            <option value="tour_operator">{t('registration.options.tourOperator')}</option>
            <option value="accommodation">{t('registration.options.accommodation')}</option>
            <option value="retail">{t('registration.options.retail')}</option>
            <option value="wellness">{t('registration.options.wellness')}</option>
            <option value="adventure">{t('registration.options.adventure')}</option>
            <option value="other">{t('registration.options.other')}</option>
          </select>
          {renderFieldError('business-type-error', errors.businessType?.message)}
        </div>
      </section>

      <div aria-hidden="true" className="border-t border-border" />

      <section aria-labelledby="legal-contact-heading" className="space-y-5">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Building2 size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 id="legal-contact-heading" className="text-base font-bold tracking-tight text-foreground">
              {t('registration.sections.legalContact')}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t('registration.sections.legalContactDescription')}
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="legal-business-name" className={labelClass}>
              <span>{t('registration.fields.legalBusinessName')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </label>
            <Input
              id="legal-business-name"
              {...register('legalBusinessName')}
              aria-invalid={Boolean(errors.legalBusinessName)}
              aria-describedby={errors.legalBusinessName ? 'legal-business-name-error' : undefined}
              placeholder={t('registration.placeholders.legalBusinessName')}
              className={inputClass}
            />
            {renderFieldError('legal-business-name-error', errors.legalBusinessName?.message)}
          </div>
          <div>
            <label htmlFor="registration-number" className={labelClass}>
              <span>{t('registration.fields.registrationNumber')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </label>
            <Input
              id="registration-number"
              {...register('registrationNumber')}
              aria-invalid={Boolean(errors.registrationNumber)}
              aria-describedby={errors.registrationNumber ? 'registration-number-error' : undefined}
              placeholder={t('registration.placeholders.registrationNumber')}
              className={inputClass}
            />
            {renderFieldError('registration-number-error', errors.registrationNumber?.message)}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-person" className={labelClass}>
              <span>{t('registration.fields.contactPerson')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </label>
            <Input
              id="contact-person"
              {...register('contactName')}
              aria-invalid={Boolean(errors.contactName)}
              aria-describedby={errors.contactName ? 'contact-person-error' : undefined}
              placeholder={t('registration.placeholders.contactPerson')}
              className={inputClass}
            />
            {renderFieldError('contact-person-error', errors.contactName?.message)}
          </div>
          <div>
            <label htmlFor="contact-phone" className={labelClass}>
              <span>{t('registration.fields.contactPhone')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </label>
            <Input
              id="contact-phone"
              {...register('contactPhone')}
              type="tel"
              aria-invalid={Boolean(errors.contactPhone)}
              aria-describedby={errors.contactPhone ? 'contact-phone-error' : undefined}
              placeholder={t('registration.placeholders.contactPhone')}
              className={inputClass}
            />
            {renderFieldError('contact-phone-error', errors.contactPhone?.message)}
          </div>
        </div>

        <div>
          <label htmlFor="business-email" className={labelClass}>
            <span>{t('registration.fields.businessEmail')}</span>
            <span className={optionalClass}>{t('registration.optional')}</span>
          </label>
          <Input
            id="business-email"
            {...register('contactEmail')}
            type="email"
            aria-invalid={Boolean(errors.contactEmail)}
            aria-describedby={errors.contactEmail ? 'business-email-error' : undefined}
            placeholder={t('registration.placeholders.businessEmail')}
            className={inputClass}
          />
          {renderFieldError('business-email-error', errors.contactEmail?.message)}
        </div>

        <div>
          <label htmlFor="business-address" className={labelClass}>
            <span>{t('registration.fields.businessAddress')}</span>
            <span className={optionalClass}>{t('registration.optional')}</span>
          </label>
          <Textarea
            id="business-address"
            {...register('businessAddress')}
            rows={3}
            aria-invalid={Boolean(errors.businessAddress)}
            aria-describedby={errors.businessAddress ? 'business-address-error' : undefined}
            placeholder={t('registration.placeholders.businessAddress')}
            className={textareaClass}
          />
          {renderFieldError('business-address-error', errors.businessAddress?.message)}
        </div>
      </section>

      <div aria-hidden="true" className="border-t border-border" />

      <section aria-labelledby="brand-assets-heading" className="space-y-5">
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <ImageIcon size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 id="brand-assets-heading" className="text-base font-bold tracking-tight text-foreground">
              {t('registration.sections.brandAssets')}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t('registration.sections.brandAssetsDescription')}
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className={labelClass}>
              <span>{t('registration.fields.logo')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </p>
            <VendorRegistrationImageField
              id="vendor-logo-file"
              label={t('registration.fields.logo')}
              file={logoFile}
              disabled={isSubmitting}
              error={logoFileError}
              onFileChange={setLogoFile}
              onError={setLogoFileError}
            />
          </div>
          <div>
            <p className={labelClass}>
              <span>{t('registration.fields.coverImage')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </p>
            <VendorRegistrationImageField
              id="vendor-cover-file"
              label={t('registration.fields.coverImage')}
              file={coverFile}
              disabled={isSubmitting}
              error={coverFileError}
              onFileChange={setCoverFile}
              onError={setCoverFileError}
            />
          </div>
          <div className="sm:col-span-2">
            <p className={labelClass}>
              <span>{t('registration.fields.gallery')}</span>
              <span className={optionalClass}>{t('registration.optional')}</span>
            </p>
            <VendorRegistrationGalleryField
              id="vendor-gallery-files"
              label={t('registration.fields.gallery')}
              files={galleryFiles}
              disabled={isSubmitting}
              error={galleryFilesError}
              onFilesChange={setGalleryFiles}
              onError={setGalleryFilesError}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-end">
        <Button type="submit" size="lg" disabled={isSubmitting} className="h-12 w-full rounded-xl font-semibold shadow-sm sm:w-auto sm:min-w-60">
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isSubmitting
            ? logoFile || coverFile || galleryFiles.length ? t('registration.uploadAndSubmitting') : t('registration.submitting')
            : t('registration.submit')}
          {!isSubmitting ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
        {onClose && (
          <Button type="button" variant="outline" size="lg" onClick={onClose} className="h-12 w-full rounded-xl sm:w-auto">
            {t('registration.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
