'use client';
// P2 — Member 2: Variant manager (B2)

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

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
    <div className="space-y-3 mt-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">{t('variants.title')}</h3>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>+ {t('variants.add')}</Button>
        )}
      </div>

      {adding && (
        <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-200">
          <Input 
            placeholder={t('variants.namePlaceholder')}
            value={newName} 
            onChange={e => setNewName(e.target.value)}
            className="h-8 text-sm"
          />
          <Input 
            placeholder={t('variants.priceOffsetPlaceholder')}
            type="number" 
            step="0.01" 
            value={newPriceOffset} 
            onChange={e => setNewPriceOffset(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd}>{tCommon('actions.save')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{tCommon('actions.cancel')}</Button>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">{t('variants.name')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('variants.priceOffset')}</th>
              {!requiresBooking && <th className="px-3 py-2 font-medium text-right">{t('variants.inventory')}</th>}
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {variants.map(v => (
              <tr key={v.id} className="hover:bg-gray-50/50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {v.name}
                    {v.is_default && <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-primary font-medium tracking-wide uppercase">{t('variants.default')}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  {v.price_offset >= 0 ? '+' : ''}{v.price_offset} {MYR_CODE}
                </td>
                {!requiresBooking && (
                  <td className="px-3 py-2 text-right">
                    <button 
                      onClick={() => handleInventoryUpdate(v.id, v.inventory?.[0]?.quantity ?? 0)}
                      className="hover:underline text-primary"
                    >
                      {v.inventory?.[0]?.quantity ?? 0}
                    </button>
                    <span className="text-xs text-gray-400 ml-1">({v.inventory?.[0]?.reserved ?? 0} {t('variants.reservedShort')})</span>
                  </td>
                )}
                <td className="px-3 py-2 text-right space-x-2">
                  {!v.is_default && (
                    <button onClick={() => handleSetDefault(v.id)} className="text-xs text-primary hover:underline">{t('variants.setDefault')}</button>
                  )}
                  {variants.length > 1 && (
                    <button onClick={() => handleDelete(v.id)} className="text-xs text-red-500 hover:underline">{t('variants.archive')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
