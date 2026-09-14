'use client';
// P2 — Member 2: Booking slot creation/edit form (B3)

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { slotCreateSchema, type SlotCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';

interface Props {
  vendorId: string;
  outlets: { id: string; name: string }[];
  products: { id: string; name: string; outlet_id: string; requires_booking: boolean; status: string }[];
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function SlotForm({ vendorId, outlets, products, onSuccess, onClose }: Props) {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<SlotCreate>({
    resolver: zodResolver(slotCreateSchema),
    defaultValues: { capacity: 10 },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedOutletId = watch('outletId');
  const selectedStartsAt = watch('startsAt');

  const selectableProducts = products.filter((product) =>
    product.outlet_id === selectedOutletId && product.requires_booking && product.status === 'active',
  );

  async function onSubmit(data: SlotCreate) {
    setServerError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? t('slotForm.saveFailed'));
        showFeedback('error', result.error?.message ?? t('slotForm.saveFailed'));
        return;
      }
      showFeedback('success', t('slotForm.created'));
      onSuccess?.();
    } catch {
      setServerError(tCommon('errors.network'));
      showFeedback('error', t('slotForm.saveNetworkError'));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('slotForm.title')}</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.outletRequired')}</label>
          <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">{t('slotForm.selectOutlet')}</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {errors.outletId && <p className="text-red-500 text-xs mt-1">{errors.outletId.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.productRequired')}</label>
          <select {...register('productId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" disabled={!selectedOutletId}>
            <option value="">{t('slotForm.selectProduct')}</option>
            {selectableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.productId && <p className="text-red-500 text-xs mt-1">{errors.productId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.startsAt')}</label>
            <Input {...register('startsAt')} type="datetime-local" />
            {errors.startsAt && <p className="text-red-500 text-xs mt-1">{errors.startsAt.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.endsAt')}</label>
            <Input {...register('endsAt')} type="datetime-local" min={selectedStartsAt || undefined} />
            {errors.endsAt && <p className="text-red-500 text-xs mt-1">{errors.endsAt.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.capacity')}</label>
            <Input {...register('capacity', { valueAsNumber: true })} type="number" min="1" />
            {errors.capacity && <p className="text-red-500 text-xs mt-1">{errors.capacity.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('slotForm.priceOverride')}</label>
            <Input {...register('priceOverride', { valueAsNumber: true })} type="number" step="0.01" placeholder={t('slotForm.optional')} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>{tCommon('actions.cancel')}</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('slotForm.saving') : t('slotForm.add')}
        </Button>
      </div>
    </form>
  );
}
