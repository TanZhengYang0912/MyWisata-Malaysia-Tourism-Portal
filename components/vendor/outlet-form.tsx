'use client';
// P2 — Member 2: Outlet creation/edit form (B2)

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { outletCreateSchema, type OutletCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import AddressAutocomplete, { type AddressSelection } from '@/components/vendor/address-autocomplete';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';

interface Props {
  vendorId: string;
  initialData?: OutletCreate & { id?: string };
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function OutletForm({ vendorId, initialData, onSuccess, onClose }: Props) {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<OutletCreate>({
    resolver: zodResolver(outletCreateSchema),
    defaultValues: { country: 'Malaysia', welcomeEnabled: true, ...initialData },
  });
  // eslint-disable-next-line react-hooks/incompatible-library
  const address = watch('address');

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
      const url = isEdit 
        ? `/api/vendors/${vendorId}/outlets/${initialData.id}` 
        : `/api/vendors/${vendorId}/outlets`;
        
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? t('outletForm.saveFailed'));
        showFeedback('error', result.error?.message ?? t('outletForm.saveFailed'));
        return;
      }
      showFeedback('success', initialData?.id ? t('outletForm.updated') : t('outletForm.created'));
      onSuccess?.();
    } catch {
      setServerError(tCommon('errors.network'));
      showFeedback('error', t('outletForm.saveNetworkError'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{initialData?.id ? t('outletForm.editTitle') : t('outletForm.addTitle')}</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.nameRequired')}</label>
          <Input {...register('name')} placeholder={t('outletForm.namePlaceholder')} />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.address')}</label>
          <AddressAutocomplete value={address || ''} onChange={(value) => setValue('address', value, { shouldDirty: true })} onSelect={applyAddress} placeholder={t('outletForm.addressPlaceholder')} />
          <p className="mt-1 text-xs text-gray-400">{t('outletForm.addressHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.city')}</label>
            <Input {...register('city')} placeholder={t('outletForm.cityPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.state')}</label>
            <Input {...register('state')} placeholder={t('outletForm.statePlaceholder')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.postcode')}</label>
            <Input {...register('postcode')} placeholder="50450" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.country')}</label>
            <Input {...register('country')} placeholder={t('outletForm.countryPlaceholder')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.phone')}</label>
            <Input {...register('phone')} placeholder="+60 12-345 6789" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.email')}</label>
            <Input {...register('email')} type="email" placeholder="branch@example.com" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.latitude')}</label>
            <Input {...register('lat', { valueAsNumber: true })} type="number" step="any" placeholder="3.1577" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.longitude')}</label>
            <Input {...register('lng', { valueAsNumber: true })} type="number" step="any" placeholder="101.7118" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.wheelchair')}</label>
            <select
              {...register('wheelchairAccessible', { setValueAs: (v) => (v === '' ? null : v === 'true') })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('outletForm.notSpecified')}</option>
              <option value="true">{t('outletForm.yes')}</option>
              <option value="false">{t('outletForm.no')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('outletForm.petFriendly')}</label>
            <select
              {...register('petFriendly', { setValueAs: (v) => (v === '' ? null : v === 'true') })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('outletForm.notSpecified')}</option>
              <option value="true">{t('outletForm.yes')}</option>
              <option value="false">{t('outletForm.no')}</option>
            </select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-gray-400">{t('outletForm.accessibilityHint')}</p>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">{t('outletForm.welcomeMessage')}</label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" {...register('welcomeEnabled')} className="h-4 w-4" />
              {t('outletForm.autoWelcome')}
            </label>
          </div>
          <textarea
            {...register('welcomeMessage')}
            rows={3}
            placeholder={t('outletForm.welcomePlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.welcomeMessage && <p className="text-red-500 text-xs mt-1">{errors.welcomeMessage.message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
