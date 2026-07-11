'use client';
// P2 — Member 2: Booking slot creation/edit form (B3)

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { slotCreateSchema, type SlotCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Props {
  vendorId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function SlotForm({ vendorId, onSuccess, onClose }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<SlotCreate>({
    resolver: zodResolver(slotCreateSchema),
    defaultValues: { capacity: 10 },
  });

  const selectedOutletId = watch('outletId');

  useEffect(() => {
    supabase.from('outlets').select('id, name').eq('vendor_id', vendorId)
      .then(({ data }) => setOutlets(data ?? []));
  }, [vendorId, supabase]);

  useEffect(() => {
    if (!selectedOutletId) {
      setProducts([]);
      return;
    }
    supabase.from('products')
      .select('id, name')
      .eq('outlet_id', selectedOutletId)
      .eq('requires_booking', true)
      .eq('status', 'active')
      .then(({ data }) => setProducts(data ?? []));
  }, [selectedOutletId, supabase]);

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
        setServerError(result.error?.message ?? 'Failed to save slot');
        return;
      }
      onSuccess?.();
    } catch {
      setServerError('Network error. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Add Booking Slot</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
          <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Select outlet...</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {errors.outletId && <p className="text-red-500 text-xs mt-1">{errors.outletId.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product (Booking Required) *</label>
          <select {...register('productId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" disabled={!selectedOutletId}>
            <option value="">Select product...</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.productId && <p className="text-red-500 text-xs mt-1">{errors.productId.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starts At *</label>
            <Input {...register('startsAt')} type="datetime-local" />
            {errors.startsAt && <p className="text-red-500 text-xs mt-1">{errors.startsAt.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ends At *</label>
            <Input {...register('endsAt')} type="datetime-local" />
            {errors.endsAt && <p className="text-red-500 text-xs mt-1">{errors.endsAt.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacity *</label>
            <Input {...register('capacity', { valueAsNumber: true })} type="number" min="1" />
            {errors.capacity && <p className="text-red-500 text-xs mt-1">{errors.capacity.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Override (RM)</label>
            <Input {...register('priceOverride', { valueAsNumber: true })} type="number" step="0.01" placeholder="Optional" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Add Slot'}
        </Button>
      </div>
    </form>
  );
}
