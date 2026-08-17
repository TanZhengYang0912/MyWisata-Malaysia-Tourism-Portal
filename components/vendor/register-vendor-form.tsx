'use client';
// P2 — Member 2: Vendor registration form (B1)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { vendorRegisterSchema, type VendorRegister } from '@/lib/validation/vendor-schemas';

interface Props {
  onClose?: () => void;
}

export default function RegisterVendorForm({ onClose }: Props) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VendorRegister>({
    resolver: zodResolver(vendorRegisterSchema),
  });

  async function onSubmit(data: VendorRegister) {
    setServerError(null);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (!res.ok) {
        setServerError(result.error?.message ?? t('registration.errors.failed'));
        showFeedback('error', result.error?.message ?? t('registration.errors.failed'));
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h2 className="text-lg font-semibold">{t('registration.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('registration.description')}</p>

      {serverError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.businessName')} *</label>
        <input
          {...register('name')}
          placeholder={t('registration.placeholders.businessName')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.description')}</label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder={t('registration.placeholders.description')}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
      </div>

      {/* Business Type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.businessType')}</label>
        <select
          {...register('businessType')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.legalBusinessName')}</label><input {...register('legalBusinessName')} placeholder={t('registration.placeholders.legalBusinessName')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.legalBusinessName && <p className="mt-1 text-xs text-destructive">{errors.legalBusinessName.message}</p>}</div>
        <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.registrationNumber')}</label><input {...register('registrationNumber')} placeholder={t('registration.placeholders.registrationNumber')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.registrationNumber && <p className="mt-1 text-xs text-destructive">{errors.registrationNumber.message}</p>}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.contactPerson')}</label><input {...register('contactName')} placeholder={t('registration.placeholders.contactPerson')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
        <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.contactPhone')}</label><input {...register('contactPhone')} placeholder={t('registration.placeholders.contactPhone')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
      </div>

      <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.businessEmail')}</label><input {...register('contactEmail')} type="email" placeholder={t('registration.placeholders.businessEmail')} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.contactEmail && <p className="mt-1 text-xs text-destructive">{errors.contactEmail.message}</p>}</div>
      <div><label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.businessAddress')}</label><textarea {...register('businessAddress')} rows={2} placeholder={t('registration.placeholders.businessAddress')} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>

      {/* Logo URL */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.logoUrl')}</label>
        <input
          {...register('logoUrl')}
          placeholder="https://..."
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.logoUrl && <p className="mt-1 text-xs text-destructive">{errors.logoUrl.message}</p>}
      </div>

      {/* Cover URL */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">{t('registration.fields.coverUrl')}</label>
        <input
          {...register('coverUrl')}
          placeholder="https://..."
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.coverUrl && <p className="mt-1 text-xs text-destructive">{errors.coverUrl.message}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? t('registration.submitting') : t('registration.submit')}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t('registration.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
