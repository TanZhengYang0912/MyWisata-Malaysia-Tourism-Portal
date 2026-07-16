'use client';
// P2 — Member 2: Voucher creation form (B3)

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { voucherCreateSchema } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useActionFeedback } from '@/components/providers/action-feedback';

interface Props {
  vendorId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function VoucherForm({ vendorId, onSuccess, onClose }: Props) {
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(voucherCreateSchema),
    defaultValues: { voucherType: 'fixed', minSpend: 0 },
  });

  useEffect(() => {
    Promise.all([
      supabase.from('outlets').select('id, name').eq('vendor_id', vendorId),
      supabase.from('products').select('id, name').eq('vendor_id', vendorId).order('name'),
    ]).then(([outletResult, productResult]) => { setOutlets(outletResult.data ?? []); setProducts(productResult.data ?? []); });
  }, [vendorId, supabase]);

  async function generateCode() {
    setGeneratingCode(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/generate-code`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Could not generate a unique code.');
      setValue('code', payload.data.code, { shouldDirty: true, shouldValidate: true });
      showFeedback('success', 'Unique voucher code generated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate a unique code.';
      setServerError(message);
      showFeedback('error', message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function onSubmit(data: z.infer<typeof voucherCreateSchema>) {
    setServerError(null);
    try {
      const payload = {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : undefined,
      };
      const res = await fetch(`/api/vendors/${vendorId}/vouchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? 'Failed to save voucher');
        showFeedback('error', result.error?.message ?? 'Failed to save voucher');
        return;
      }
      showFeedback('success', 'Voucher created and submitted for review.');
      onSuccess?.();
    } catch {
      setServerError('Network error. Please try again.');
      showFeedback('error', 'Voucher could not be saved. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Create Voucher</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <div className="flex gap-2">
              <Input {...register('code')} className="uppercase" placeholder="e.g. SUMMER24" />
              <Button type="button" variant="outline" disabled={generatingCode} onClick={() => void generateCode()}>{generatingCode ? '…' : 'Auto'}</Button>
            </div>
            {errors.code && <p className="text-red-500 text-xs mt-1">{(errors.code as { message?: string })?.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input {...register('name')} placeholder="e.g. Summer Special" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{(errors.name as { message?: string })?.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select {...register('voucherType')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="fixed">Fixed Amount (RM)</option>
              <option value="percent">Percentage (%)</option>
              <option value="bogo">Buy X Get Y</option>
            </select>
          </div>
          
          {/* eslint-disable-next-line react-hooks/incompatible-library */}
          <div className={watch('voucherType') === 'bogo' ? 'hidden' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value *</label>
            <Input {...register('discountValue', { valueAsNumber: true })} type="number" step="0.01" />
            {errors.discountValue && <p className="text-red-500 text-xs mt-1">{(errors.discountValue as { message?: string })?.message}</p>}
          </div>
        </div>

        {/* eslint-disable-next-line react-hooks/incompatible-library */}
        {watch('voucherType') === 'bogo' && <div className="grid grid-cols-3 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="col-span-3"><label className="block text-sm font-medium text-gray-700 mb-1">Eligible product *</label><select {...register('productId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"><option value="">Select product...</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{errors.productId && <p className="text-red-500 text-xs mt-1">{(errors.productId as { message?: string })?.message}</p>}</div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Buy quantity *</label><Input {...register('buyQuantity', { valueAsNumber: true })} type="number" min="1" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Free quantity *</label><Input {...register('freeQuantity', { valueAsNumber: true })} type="number" min="1" /></div>
          <p className="col-span-3 text-xs text-amber-800">Example: Buy 1 Get 1 applies the free item to every complete eligible set in the cart.</p>
        </div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Spend (RM)</label>
            <Input {...register('minSpend', { valueAsNumber: true })} type="number" step="0.01" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
            <Input {...register('maxUses', { valueAsNumber: true })} type="number" placeholder="Unlimited" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Per Customer Limit</label>
            <Input {...register('perCustomerLimit', { setValueAs: (value) => value === '' ? null : Number(value) })} type="number" min="1" placeholder="Unlimited" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
            <Input {...register('validFrom')} type="datetime-local" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
            <Input {...register('validUntil')} type="datetime-local" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Specific Outlet (Optional)</label>
          <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Outlets</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Create Voucher'}
        </Button>
      </div>
    </form>
  );
}
