'use client';
// P2 — Member 2: Outlet creation/edit form (B2)

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { outletCreateSchema, type OutletCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AddressAutocomplete, { type AddressSelection } from '@/components/vendor/address-autocomplete';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import { SAMPLE_MY_PHONE } from '@/lib/i18n/invariant-tokens';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { ACCOMMODATION_PROPERTY_TYPES, OUTLET_BADGE_OPTIONS } from '@/lib/vendor/taxonomy';

interface Props {
  vendorId: string;
  initialData?: OutletCreate & { id?: string };
  showAccommodationTypes?: boolean;
  onSuccess?: () => void;
  onClose?: () => void;
  /** Lets the host dialog guard Escape / close against losing edits. */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function OutletForm({ vendorId, initialData, showAccommodationTypes = false, onSuccess, onClose, onDirtyChange }: Props) {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting, isDirty, dirtyFields } } = useForm<z.input<typeof outletCreateSchema>, unknown, OutletCreate>({
    resolver: zodResolver(outletCreateSchema),
    defaultValues: { country: 'Malaysia', welcomeEnabled: true, ...initialData },
  });
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const address = watch('address');
  const foodServiceModes = watch('foodServiceModes') ?? [];
  const badgeSlugs = watch('badgeSlugs') ?? [];
  const accommodationTypeSlugs = watch('accommodationTypeSlugs') ?? [];

  function applyAddress(selection: AddressSelection) {
    setValue('address', selection.address || selection.label, { shouldDirty: true });
    setValue('city', selection.city, { shouldDirty: true });
    setValue('state', selection.state, { shouldDirty: true });
    setValue('postcode', selection.postcode, { shouldDirty: true });
    setValue('country', selection.country || 'Malaysia', { shouldDirty: true });
    if (selection.lat !== null) setValue('lat', selection.lat, { shouldDirty: true });
    if (selection.lng !== null) setValue('lng', selection.lng, { shouldDirty: true });
  }

  async function onSubmit(data: OutletCreate) {
    setServerError(null);
    try {
      const isEdit = !!initialData?.id;
      // An unchanged owner save would still re-send every field and take a
      // non-hotel outlet offline for review, so nothing is sent.
      if (isEdit && Object.keys(dirtyFields).length === 0) {
        showFeedback('info', t('outletForm.noChanges'));
        onClose?.();
        return;
      }
      const url = isEdit 
        ? `/api/vendors/${vendorId}/outlets/${initialData.id}` 
        : `/api/vendors/${vendorId}/outlets`;
      const taxonomyFields = ['badgeSlugs', 'accommodationTypeSlugs'] as const;
      const changedFields = Object.keys(dirtyFields);
      const taxonomyOnly = isEdit && changedFields.length > 0 && changedFields.every((field) => taxonomyFields.includes(field as (typeof taxonomyFields)[number]));
      const requestData = taxonomyOnly
        ? Object.fromEntries(taxonomyFields.filter((field) => dirtyFields[field]).map((field) => [field, data[field]]))
        : data;
        
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? t('outletForm.saveFailed'));
        showFeedback('error', result.error?.message ?? t('outletForm.saveFailed'));
        return;
      }
      const wentOfflineForReview = res.status === 200 && isEdit && result.data?.review_status === 'pending_review' && result.data?.status === 'inactive';
      showFeedback('success', res.status === 202 ? t('outletForm.hotelPendingReview') : wentOfflineForReview ? t('outletForm.savedPendingReview') : initialData?.id ? t('outletForm.updated') : t('outletForm.created'));
      onSuccess?.();
    } catch {
      setServerError(tCommon('errors.network'));
      showFeedback('error', t('outletForm.saveNetworkError'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <div data-outlet-form-scroll-region className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        {initialData?.id && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('outletForm.reviewNotice')}</p>
        )}
        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {serverError}
          </div>
        )}

        <section className="space-y-4" aria-labelledby="outlet-business-details">
          <h3 id="outlet-business-details" className="text-sm font-semibold text-foreground">{t('outletForm.sections.businessDetails')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.nameRequired')}</label>
              <Input {...register('name')} placeholder={t('outletForm.namePlaceholder')} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.address')}</label>
              <AddressAutocomplete value={address || ''} onChange={(value) => setValue('address', value, { shouldDirty: true })} onSelect={applyAddress} placeholder={t('outletForm.addressPlaceholder')} />
              <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('outletForm.addressHint')}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.city')}</label>
              <Input {...register('city')} placeholder={t('outletForm.cityPlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.state')}</label>
              <Input {...register('state')} placeholder={t('outletForm.statePlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.postcode')}</label>
              <Input {...register('postcode')} placeholder="50450" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.country')}</label>
              <Input {...register('country')} placeholder={t('outletForm.countryPlaceholder')} />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-5" aria-labelledby="outlet-contact-map">
          <h3 id="outlet-contact-map" className="text-sm font-semibold text-foreground">{t('outletForm.sections.contactAndMap')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.phone')}</label>
              <Input {...register('phone')} placeholder={SAMPLE_MY_PHONE} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.email')}</label>
              <Input {...register('email')} type="email" placeholder={t('outletForm.emailPlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.latitude')}</label>
              <Input {...register('lat', { valueAsNumber: true })} type="number" step="any" placeholder="3.1577" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.longitude')}</label>
              <Input {...register('lng', { valueAsNumber: true })} type="number" step="any" placeholder="101.7118" />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-5" aria-labelledby="outlet-visitor-options">
          <h3 id="outlet-visitor-options" className="text-sm font-semibold text-foreground">{t('outletForm.sections.visitorOptions')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.wheelchair')}</label>
              <select {...register('wheelchairAccessible', { setValueAs: (v) => (v === '' ? null : v === 'true') })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-border">
                <option value="">{t('outletForm.notSpecified')}</option>
                <option value="true">{t('outletForm.yes')}</option>
                <option value="false">{t('outletForm.no')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.petFriendly')}</label>
              <select {...register('petFriendly', { setValueAs: (v) => (v === '' ? null : v === 'true') })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-border">
                <option value="">{t('outletForm.notSpecified')}</option>
                <option value="true">{t('outletForm.yes')}</option>
                <option value="false">{t('outletForm.no')}</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-border">
            <legend className="px-1 text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.foodServiceModes')}</legend>
            <p className="text-xs text-gray-500 dark:text-muted-foreground">{t('outletForm.foodServiceModesHint')}</p>
            <div className="flex flex-wrap gap-4">
              {(['dine_in', 'takeaway'] as const).map((mode) => (
                <label key={mode} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-foreground">
                  <input type="checkbox" checked={foodServiceModes.includes(mode)} onChange={(event) => {
                    const next = event.target.checked ? [...foodServiceModes, mode] : foodServiceModes.filter((value) => value !== mode);
                    setValue('foodServiceModes', next, { shouldDirty: true, shouldValidate: true });
                  }} className="h-4 w-4 rounded border-gray-300 text-primary dark:border-border" />
                  {mode === 'dine_in' ? t('outletForm.dine_in') : t('outletForm.takeaway')}
                </label>
              ))}
            </div>
            {errors.foodServiceModes && <p className="text-xs text-red-600 dark:text-red-300">{t('outletForm.foodServiceModeRequired')}</p>}
          </fieldset>
        </section>

        <section className="space-y-4 border-t border-border pt-5" aria-labelledby="outlet-categories">
          <h3 id="outlet-categories" className="text-sm font-semibold text-foreground">{t('outletForm.sections.outletCategories')}</h3>
          <div className={showAccommodationTypes ? 'grid gap-4 sm:grid-cols-2' : ''}>
            <fieldset className="rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">{t('taxonomy.outletBadges.title')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {OUTLET_BADGE_OPTIONS.map(({ slug, labelKey }) => {
                  const id = `outlet-badge-${slug}`;
                  const checked = badgeSlugs.includes(slug);
                  return <label key={slug} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted/60">
                    <Checkbox id={id} checked={checked} onCheckedChange={(nextChecked) => setValue('badgeSlugs', nextChecked ? [...badgeSlugs, slug] : badgeSlugs.filter((value) => value !== slug), { shouldDirty: true, shouldValidate: true })} />
                    {t(`taxonomy.outletBadges.options.${labelKey}`)}
                  </label>;
                })}
              </div>
              {errors.badgeSlugs && <p className="mt-2 text-xs text-destructive">{errors.badgeSlugs.message}</p>}
            </fieldset>

            {showAccommodationTypes && <fieldset className="rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">{t('taxonomy.accommodationTypes.title')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACCOMMODATION_PROPERTY_TYPES.map(({ slug }) => {
                  const id = `property-type-${slug}`;
                  const checked = accommodationTypeSlugs.includes(slug);
                  return <label key={slug} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted/60">
                    <Checkbox id={id} checked={checked} onCheckedChange={(nextChecked) => setValue('accommodationTypeSlugs', nextChecked ? [...accommodationTypeSlugs, slug] : accommodationTypeSlugs.filter((value) => value !== slug), { shouldDirty: true, shouldValidate: true })} />
                    {t(`taxonomy.accommodationTypes.options.${slug}`)}
                  </label>;
                })}
              </div>
              {errors.accommodationTypeSlugs && <p className="mt-2 text-xs text-destructive">{errors.accommodationTypeSlugs.message}</p>}
            </fieldset>}
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-5" aria-labelledby="outlet-welcome-message">
          <h3 id="outlet-welcome-message" className="text-sm font-semibold text-foreground">{t('outletForm.sections.welcomeMessage')}</h3>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground">{t('outletForm.welcomeMessage')}</label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted-foreground">
                <input type="checkbox" {...register('welcomeEnabled')} className="h-4 w-4" />
                {t('outletForm.autoWelcome')}
              </label>
            </div>
            <textarea {...register('welcomeMessage')} rows={3} placeholder={t('outletForm.welcomePlaceholder')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-border" />
            {errors.welcomeMessage && <p className="mt-1 text-xs text-red-500">{errors.welcomeMessage.message}</p>}
          </div>
        </section>
      </div>

      <div data-outlet-form-actions className="sticky bottom-0 z-10 flex shrink-0 justify-end gap-3 border-t border-border bg-card/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur sm:px-6">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>{tCommon('actions.cancel')}</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('outletForm.saving') : t('outletForm.save')}
        </Button>
      </div>
    </form>
  );
}
