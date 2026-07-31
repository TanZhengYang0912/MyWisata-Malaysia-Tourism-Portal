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
import { localDateTimeToIso, optionalNumber, optionalSelect } from '@/lib/vendor/voucher-form-values';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import { voucherDiscountLabel } from '@/lib/vendor/voucher-ui';

interface Props {
  vendorId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

type VoucherFormInput = z.input<typeof voucherCreateSchema>;
type VoucherFormData = z.output<typeof voucherCreateSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600" role="alert">{message}</p>;
}

export default function VoucherForm({ vendorId, onSuccess, onClose }: Props) {
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [pendingData, setPendingData] = useState<VoucherFormData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<VoucherFormInput, unknown, VoucherFormData>({
    resolver: zodResolver(voucherCreateSchema),
    defaultValues: { voucherType: 'fixed', minSpend: 0 },
  });

  function fieldError(field: keyof VoucherFormInput) {
    const message = errors[field]?.message;
    return typeof message === 'string' ? message : undefined;
  }

  function inputClass(field: keyof VoucherFormInput) {
    return `w-full ${fieldError(field) ? 'border-red-400 focus-visible:ring-red-300' : ''}`;
  }

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

  async function submitVoucher(data: VoucherFormData) {
    setConfirming(true);
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
        const message = result.error?.message ?? 'Failed to save voucher';
        const fieldErrors = result.error?.details?.fieldErrors as Record<string, string[]> | undefined;
        Object.entries(fieldErrors ?? {}).forEach(([field, messages]) => {
          if (field in errors || field in { code: true, name: true, voucherType: true, discountValue: true, minSpend: true, maxUses: true, perCustomerLimit: true, validFrom: true, validUntil: true, outletId: true, productId: true, buyQuantity: true, freeQuantity: true }) {
            setError(field as keyof VoucherFormInput, { type: 'server', message: messages[0] });
          }
        });
        setServerError(message);
        showFeedback('error', message);
        return;
      }
      showFeedback('success', 'Voucher created and submitted for review.');
      setPendingData(null);
      onSuccess?.();
    } catch {
      setServerError('Network error. Please try again.');
      showFeedback('error', 'Voucher could not be saved. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  function onSubmit(data: VoucherFormData) {
    setPendingData(data);
  }

  function onInvalid() {
    setServerError('Please fix the highlighted fields before creating this voucher.');
    showFeedback('error', 'Please fix the highlighted fields before creating this voucher.');
  }

  // eslint-disable-next-line react-hooks/incompatible-library
  const voucherType = watch('voucherType');
  const discountValue = watch('discountValue');
  const minSpend = watch('minSpend');
  const maxUses = watch('maxUses');
  const perCustomerLimit = watch('perCustomerLimit');
  const selectedOutlet = watch('outletId');
  const discountSummary = voucherType === 'bogo'
    ? 'Buy X, get Y free'
    : voucherType === 'percent'
      ? `${Number(discountValue || 0)}% off`
      : `RM ${Number(discountValue || 0).toFixed(2)} off`;
  const pendingSummary = pendingData
    ? `${pendingData.code} · ${voucherDiscountLabel({ voucherType: pendingData.voucherType, discountValue: pendingData.discountValue, buyQuantity: pendingData.buyQuantity, freeQuantity: pendingData.freeQuantity })}`
    : '';

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Create Voucher</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <div className="flex gap-2">
              <Input {...register('code')} aria-invalid={Boolean(fieldError('code'))} aria-describedby={fieldError('code') ? 'voucher-code-error' : undefined} className={`uppercase ${inputClass('code')}`} placeholder="e.g. SUMMER24" />
              <Button type="button" variant="outline" disabled={generatingCode} onClick={() => void generateCode()}>{generatingCode ? '…' : 'Auto'}</Button>
            </div>
            <span id="voucher-code-error"><FieldError message={fieldError('code')} /></span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input {...register('name')} aria-invalid={Boolean(fieldError('name'))} className={inputClass('name')} placeholder="e.g. Summer Special" />
            <FieldError message={fieldError('name')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select {...register('voucherType')} aria-invalid={Boolean(fieldError('voucherType'))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="fixed">Fixed Amount (RM)</option>
              <option value="percent">Percentage (%)</option>
              <option value="bogo">Buy X Get Y</option>
            </select>
            <FieldError message={fieldError('voucherType')} />
          </div>
          
          <div className={voucherType === 'bogo' ? 'hidden' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value *</label>
            <Input {...register('discountValue', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('discountValue'))} className={inputClass('discountValue')} type="number" step="0.01" />
            <FieldError message={fieldError('discountValue')} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Applicable product {voucherType === 'bogo' ? '*' : '(Optional)'}</label>
          <select {...register('productId', { setValueAs: optionalSelect })} aria-invalid={Boolean(fieldError('productId'))} className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${fieldError('productId') ? 'border-red-400' : ''}`}>
            <option value="">All products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <FieldError message={fieldError('productId')} />
        </div>

        {voucherType === 'bogo' && <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Buy quantity *</label><Input {...register('buyQuantity', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('buyQuantity'))} className={inputClass('buyQuantity')} type="number" min="1" /><FieldError message={fieldError('buyQuantity')} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Free quantity *</label><Input {...register('freeQuantity', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('freeQuantity'))} className={inputClass('freeQuantity')} type="number" min="1" /><FieldError message={fieldError('freeQuantity')} /></div>
          <p className="col-span-2 text-xs text-amber-800">Example: Buy 1 Get 1 applies the free item to every complete eligible set in the cart.</p>
        </div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Spend (RM)</label>
            <Input {...register('minSpend', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('minSpend'))} className={inputClass('minSpend')} type="number" step="0.01" placeholder="No minimum" />
            <FieldError message={fieldError('minSpend')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
            <Input {...register('maxUses', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('maxUses'))} className={inputClass('maxUses')} type="number" min="1" placeholder="Unlimited" />
            <FieldError message={fieldError('maxUses')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Per Customer Limit</label>
            <Input {...register('perCustomerLimit', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('perCustomerLimit'))} className={inputClass('perCustomerLimit')} type="number" min="1" placeholder="Unlimited" />
            <FieldError message={fieldError('perCustomerLimit')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
            <Input {...register('validFrom', { setValueAs: localDateTimeToIso })} aria-invalid={Boolean(fieldError('validFrom'))} className={inputClass('validFrom')} type="datetime-local" />
            <FieldError message={fieldError('validFrom')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
            <Input {...register('validUntil', { setValueAs: localDateTimeToIso })} aria-invalid={Boolean(fieldError('validUntil'))} className={inputClass('validUntil')} type="datetime-local" />
            <FieldError message={fieldError('validUntil')} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Specific Outlet (Optional)</label>
          <select {...register('outletId', { setValueAs: optionalSelect })} aria-invalid={Boolean(fieldError('outletId'))} className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${fieldError('outletId') ? 'border-red-400' : ''}`}>
            <option value="">All Outlets</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <FieldError message={fieldError('outletId')} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        <p className="font-semibold text-gray-900">Voucher summary</p>
        <p className="mt-1">{discountSummary} · Min spend RM {Number(minSpend || 0).toFixed(2)} · {maxUses ? `${maxUses} total uses` : 'Unlimited total uses'} · {perCustomerLimit ? `${perCustomerLimit} per customer` : 'Unlimited per customer'} · {selectedOutlet ? 'Outlet restricted' : 'All outlets'}</p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Create Voucher'}
        </Button>
      </div>
      <ActionConfirmationDialog open={Boolean(pendingData)} title="Submit this voucher for review?" description={`${pendingSummary}. It will be created as inactive until an administrator approves it.`} confirmLabel="Submit for review" tone="primary" busy={confirming} onCancel={() => { if (!confirming) setPendingData(null); }} onConfirm={() => { if (pendingData) void submitVoucher(pendingData); }} />
    </form>
  );
}
