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

interface Props {
  vendorId: string;
  initialData?: OutletCreate & { id?: string };
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function OutletForm({ vendorId, initialData, onSuccess, onClose }: Props) {
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
        setServerError(result.error?.message ?? 'Failed to save outlet');
        showFeedback('error', result.error?.message ?? 'Failed to save outlet');
        return;
      }
      showFeedback('success', initialData?.id ? 'Outlet updated successfully.' : 'Outlet created successfully.');
      onSuccess?.();
    } catch {
      setServerError('Network error. Please try again.');
      showFeedback('error', 'Outlet could not be saved. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{initialData?.id ? 'Edit Outlet' : 'Add Outlet'}</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <Input {...register('name')} placeholder="e.g. KLCC Branch" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <AddressAutocomplete value={address || ''} onChange={(value) => setValue('address', value, { shouldDirty: true })} onSelect={applyAddress} placeholder="Search a Malaysia address…" />
          <p className="mt-1 text-xs text-gray-400">Choose a suggestion to fill city, state, postcode and map coordinates.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <Input {...register('city')} placeholder="Kuala Lumpur" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <Input {...register('state')} placeholder="Wilayah Persekutuan" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
            <Input {...register('postcode')} placeholder="50450" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <Input {...register('country')} placeholder="Malaysia" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <Input {...register('phone')} placeholder="+60 12-345 6789" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input {...register('email')} type="email" placeholder="branch@example.com" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
            <Input {...register('lat', { valueAsNumber: true })} type="number" step="any" placeholder="3.1577" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
            <Input {...register('lng', { valueAsNumber: true })} type="number" step="any" placeholder="101.7118" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wheelchair accessible</label>
            <select
              {...register('wheelchairAccessible', { setValueAs: (v) => (v === '' ? null : v === 'true') })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Not specified</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pet-friendly</label>
            <select
              {...register('petFriendly', { setValueAs: (v) => (v === '' ? null : v === 'true') })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Not specified</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-gray-400">Only “Yes” shows an accessibility badge and boosts you for travellers who need it. Leave “Not specified” if unsure.</p>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Chat welcome message</label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input type="checkbox" {...register('welcomeEnabled')} className="h-4 w-4" />
              Auto-send welcome
            </label>
          </div>
          <textarea
            {...register('welcomeMessage')}
            rows={3}
            placeholder="Welcome! Thanks for your interest. Any questions? (leave blank to use the default greeting)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.welcomeMessage && <p className="text-red-500 text-xs mt-1">{errors.welcomeMessage.message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Outlet'}
        </Button>
      </div>
    </form>
  );
}
