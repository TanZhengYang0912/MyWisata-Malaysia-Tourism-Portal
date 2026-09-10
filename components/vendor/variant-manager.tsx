'use client';
// P2 — Member 2: Variant manager (B2)

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import { formatMYR } from '@/lib/i18n/format';

interface VariantData {
  id: string;
  name: string;
  price_offset: number;
  is_default: boolean;
  sku: string | null;
  inventory: { quantity: number; reserved: number }[];
}

interface Props {
  vendorId: string;
  productId: string;
  variants: VariantData[];
  onUpdate: () => void;
  requiresBooking: boolean;
}

export default function VariantManager({ vendorId, productId, variants, onUpdate, requiresBooking }: Props) {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { showFeedback } = useActionFeedback();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPriceOffset, setNewPriceOffset] = useState('');

  async function handleAdd() {
    if (!newName) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, priceOffset: Number(newPriceOffset) || 0, isDefault: variants.length === 0 }),
      });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); showFeedback('error', payload.error?.message || t('variants.addFailed')); return; }
      setNewName(''); setNewPriceOffset(''); setAdding(false); showFeedback('success', t('variants.added')); onUpdate();
    } catch { showFeedback('error', t('variants.addTryAgain')); }
  }

  async function handleSetDefault(variantId: string) {
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/variants/${variantId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); showFeedback('error', payload.error?.message || t('variants.defaultFailed')); return; }
      showFeedback('success', t('variants.defaultUpdated')); onUpdate();
    } catch { showFeedback('error', t('variants.defaultTryAgain')); }
  }

  async function handleDelete(variantId: string) {
    if (!confirm(t('variants.archiveConfirm'))) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/variants/${variantId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); showFeedback('error', payload.error?.message || t('variants.archiveFailed')); return; }
      showFeedback('success', t('variants.archived')); onUpdate();
    } catch { showFeedback('error', t('variants.archiveTryAgain')); }
  }

  async function handleInventoryUpdate(variantId: string, currentQty: number) {
    const newQty = prompt(t('variants.quantityPrompt'), String(currentQty));
    if (newQty === null) return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 0) return alert(t('variants.invalidQuantity'));

    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/variants/${variantId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty }) });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); showFeedback('error', payload.error?.message || t('variants.inventoryFailed')); return; }
      showFeedback('success', t('variants.inventoryUpdated')); onUpdate();
    } catch { showFeedback('error', t('variants.inventoryTryAgain')); }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{t('variants.title')}</h3>
        {!adding && <Button variant="outline" size="sm" onClick={() => setAdding(true)}><span aria-hidden="true">+</span>{t('variants.add')}</Button>}
      </div>

      {adding && (
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
          <label htmlFor="variant-name" className="grid gap-1 text-xs font-medium text-gray-600">
            {t('variants.name')}
            <Input id="variant-name" placeholder={t('variants.namePlaceholder')} value={newName} onChange={e => setNewName(e.target.value)} className="h-9 bg-white text-sm" />
          </label>
          <label htmlFor="variant-price-offset" className="grid gap-1 text-xs font-medium text-gray-600">
            {t('variants.priceOffset')}
            <Input id="variant-price-offset" placeholder={t('variants.priceOffsetPlaceholder')} type="number" step="0.01" value={newPriceOffset} onChange={e => setNewPriceOffset(e.target.value)} className="h-9 bg-white text-sm" />
          </label>
          <Button size="sm" onClick={handleAdd}>{tCommon('actions.save')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{tCommon('actions.cancel')}</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-[620px] w-full text-left text-sm" aria-label={t('variants.title')}>
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t('variants.name')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('variants.priceOffset')}</th>
              {!requiresBooking && <th className="px-4 py-3 text-right font-medium">{t('variants.inventory')}</th>}
              <th className="px-4 py-3 font-medium"><span className="sr-only">{t('variants.title')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {variants.map(v => (
              <tr key={v.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{v.name}</span>
                    {v.is_default && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">{t('variants.default')}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMYR(Math.abs(v.price_offset))}</td>
                {!requiresBooking && (
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => handleInventoryUpdate(v.id, v.inventory?.[0]?.quantity ?? 0)} className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10">
                      {v.inventory?.[0]?.quantity ?? 0}
                    </button>
                    <span className="ml-1 text-xs text-gray-400">({v.inventory?.[0]?.reserved ?? 0} {t('variants.reservedShort')})</span>
                  </td>
                )}
                <td className="space-x-2 px-4 py-3 text-right">
                  {!v.is_default && <button type="button" onClick={() => handleSetDefault(v.id)} className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10">{t('variants.setDefault')}</button>}
                  {variants.length > 1 && <button type="button" onClick={() => handleDelete(v.id)} className="text-xs text-red-500 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20">{t('variants.archive')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
