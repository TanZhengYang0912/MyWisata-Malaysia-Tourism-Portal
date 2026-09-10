'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import { formatMYR } from '@/lib/i18n/format';
import { getProductDetailsLayoutClasses } from '@/lib/vendor/product-details-layout';

type PriceRule = { id: string; rule_type: string; label: string; multiplier: number | null; fixed_amount: number | null; min_quantity: number | null; priority: number; is_active: boolean; bundle_product_ids?: string[] | null };
type ProductOption = { id: string; name: string; base_price: number };

export default function PriceRuleManager({ vendorId, productId, productOptions = [] }: { vendorId: string; productId: string; productOptions?: ProductOption[] }) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const layout = getProductDetailsLayoutClasses();
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [ruleType, setRuleType] = useState('peak');
  const [label, setLabel] = useState('');
  const [multiplier, setMultiplier] = useState('1.2');
  const [fixedAmount, setFixedAmount] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [priority, setPriority] = useState('0');
  const [bundleProductIds, setBundleProductIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules`, { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok) setRules(payload.data || []);
  }

  // The fetch synchronizes this client panel with the latest server-side rules.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [vendorId, productId]);

  async function addRule() {
    if (!label.trim()) { setMessage(t('pricing.labelRequired')); return; }
    setBusy(true); setMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleType, label: label.trim(), multiplier: multiplier ? Number(multiplier) : undefined, fixedAmount: fixedAmount ? Number(fixedAmount) : undefined, minQuantity: minQuantity ? Number(minQuantity) : undefined, bundleProductIds: ruleType === 'bundle' ? bundleProductIds : undefined, priority: Number(priority) || 0 }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { const errorMessage = payload.error?.message || t('pricing.addFailed'); setMessage(errorMessage); showFeedback('error', errorMessage); return; }
    setLabel(''); setFixedAmount(''); setMinQuantity(''); setBundleProductIds([]); setMessage(t('pricing.added')); showFeedback('success', t('pricing.added')); void load();
  }

  async function disableRule(ruleId: string) {
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules/${ruleId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const errorMessage = payload.error?.message || t('pricing.disableFailed'); setMessage(errorMessage); showFeedback('error', errorMessage); return; }
      setMessage(t('pricing.disabled')); showFeedback('success', t('pricing.disabled')); void load();
    } catch { setMessage(t('pricing.disableFailed')); showFeedback('error', t('pricing.disableTryAgain')); }
  }

  return (
    <div className={layout.pricing}>
      <div>
        <p className="text-sm font-semibold text-gray-900">{t('pricing.title')}</p>
        <p className="mt-1 text-xs text-gray-600">{t('pricing.description')}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label htmlFor="pricing-rule-type" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.title')}
          <select id="pricing-rule-type" value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10">
            <option value="peak">{t('pricing.peak')}</option>
            <option value="off_peak">{t('pricing.offPeak')}</option>
            <option value="group_size">{t('pricing.groupSize')}</option>
            <option value="tiered">{t('pricing.tiered')}</option>
            <option value="bundle">{t('pricing.bundle')}</option>
            <option value="date_range">{t('pricing.dateRange')}</option>
            <option value="weekend">{t('pricing.weekend')}</option>
          </select>
        </label>
        <label htmlFor="pricing-rule-label" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.labelPlaceholder')}
          <input id="pricing-rule-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('pricing.labelPlaceholder')} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10" />
        </label>
        <label htmlFor="pricing-rule-multiplier" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.multiplier')}
          <input id="pricing-rule-multiplier" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} type="number" min="0.01" step="0.01" placeholder={t('pricing.multiplier')} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10" />
        </label>
        <label htmlFor="pricing-rule-fixed-amount" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.fixedAmount')}
          <input id="pricing-rule-fixed-amount" value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} type="number" min="0" step="0.01" placeholder={t('pricing.fixedAmount')} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10" />
        </label>
        <label htmlFor="pricing-rule-minimum-quantity" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.minimumQuantity')}
          <input id="pricing-rule-minimum-quantity" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} type="number" min="1" placeholder={t('pricing.minimumQuantity')} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10" />
        </label>
        <label htmlFor="pricing-rule-priority" className="grid gap-1 text-xs font-medium text-gray-700">
          {t('pricing.priority')}
          <input id="pricing-rule-priority" value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="-1000" max="1000" placeholder={t('pricing.priority')} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10" />
        </label>

        {ruleType === 'bundle' && (
          <div className="rounded-lg border border-gray-200 bg-white p-3 sm:col-span-2">
            <p className="text-xs font-semibold text-gray-700">{t('pricing.bundleProducts')}</p>
            <p className="mt-1 text-[11px] text-gray-500">{t('pricing.bundleProductsHint')}</p>
            <div className="mt-2 grid max-h-28 gap-1 overflow-y-auto sm:grid-cols-2">
              {productOptions.length ? productOptions.map((product) => (
                <label key={product.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={bundleProductIds.includes(product.id)} onChange={() => setBundleProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} />
                  <span className="truncate">{product.name}</span>
                </label>
              )) : <span className="text-xs text-gray-400">{t('pricing.noProducts')}</span>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" onClick={addRule} disabled={busy || (ruleType === 'bundle' && bundleProductIds.length === 0)}>{busy ? t('pricing.adding') : t('pricing.add')}</Button>
        {message && <p className="text-xs text-gray-600" role="status">{message}</p>}
      </div>

      {rules.length > 0 && (
        <div className="mt-4 space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-semibold text-gray-800">{rule.label}</span>
                <span className="ml-2 text-gray-500">{rule.rule_type} · {t('pricing.priorityValue', { value: rule.priority ?? 0 })} · {rule.multiplier ? `×${rule.multiplier}` : rule.fixed_amount ? formatMYR(rule.fixed_amount) : t('pricing.configured')}{rule.rule_type === 'bundle' && rule.bundle_product_ids?.length ? ` · ${t('pricing.bundleItems', { count: rule.bundle_product_ids.length })}` : ''}</span>
              </div>
              <button type="button" onClick={() => disableRule(rule.id)} className="w-fit font-semibold text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20">{t('pricing.disable')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
