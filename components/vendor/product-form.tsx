'use client';
// P2 — Member 2: Product creation/edit form (B2)

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productCreateSchema, type ProductCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Props {
  vendorId: string;
  initialData?: ProductCreate & { id?: string };
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function ProductForm({ vendorId, initialData, onSuccess, onClose }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductCreate>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: initialData || { requiresBooking: false, productType: 'product' },
  });

  useEffect(() => {
    supabase.from('outlets').select('id, name').eq('vendor_id', vendorId)
      .then(({ data }) => setOutlets(data ?? []));
  }, [vendorId, supabase]);

  async function onSubmit(data: ProductCreate) {
    setServerError(null);
    try {
      const isEdit = !!initialData?.id;
      const url = isEdit 
        ? `/api/vendors/${vendorId}/products/${initialData.id}` 
        : `/api/vendors/${vendorId}/products`;
        
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? 'Failed to save product');
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
        <h2 className="text-xl font-semibold">{initialData?.id ? 'Edit Product' : 'Add Product'}</h2>
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
          <Input {...register('name')} placeholder="e.g. Guided City Tour" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Product details..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select {...register('productType')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="product">Physical Product</option>
              <option value="activity">Activity</option>
              <option value="experience">Experience</option>
              <option value="food">Food & Beverage</option>
              <option value="digital">Digital</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (RM) *</label>
            <Input {...register('basePrice', { valueAsNumber: true })} type="number" step="0.01" />
            {errors.basePrice && <p className="text-red-500 text-xs mt-1">{errors.basePrice.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
            <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select outlet...</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {errors.outletId && <p className="text-red-500 text-xs mt-1">{errors.outletId.message}</p>}
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" {...register('requiresBooking')} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              Requires Booking (Timeslots)
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Product'}
        </Button>
      </div>
    </form>
  );
}
