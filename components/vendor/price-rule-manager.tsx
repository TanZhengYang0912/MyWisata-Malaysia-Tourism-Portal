'use client';

import { useEffect, useState } from 'react';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import { formatMYR } from '@/lib/i18n/format';

type PriceRule = { id: string; rule_type: string; label: string; multiplier: number | null; fixed_amount: number | null; min_quantity: number | null; priority: number; is_active: boolean; bundle_product_ids?: string[] | null };
type ProductOption = { id: string; name: string; base_price: number };

export default function PriceRuleManager({ vendorId, productId, productOptions = [] }: { vendorId: string; productId: string; productOptions?: ProductOption[] }) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
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
    if (!response.ok) { const message = payload.error?.message || t('pricing.addFailed'); setMessage(message); showFeedback('error', message); return; }
    setLabel(''); setFixedAmount(''); setMinQuantity(''); setBundleProductIds([]); setMessage(t('pricing.added')); showFeedback('success', t('pricing.added')); void load();
  }

  async function disableRule(ruleId: string) {
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules/${ruleId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('pricing.disableFailed'); setMessage(message); showFeedback('error', message); return; }
      setMessage(t('pricing.disabled')); showFeedback('success', t('pricing.disabled')); void load();
    } catch { setMessage(t('pricing.disableFailed')); showFeedback('error', t('pricing.disableTryAgain')); }
  }

  return <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/50 p-4"><div><p className="text-sm font-semibold text-gray-900">{t('pricing.title')}</p><p className="mt-1 text-xs text-gray-600">{t('pricing.description')}</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><option value="peak">{t('pricing.peak')}</option><option value="off_peak">{t('pricing.offPeak')}</option><option value="group_size">{t('pricing.groupSize')}</option><option value="tiered">{t('pricing.tiered')}</option><option value="bundle">{t('pricing.bundle')}</option><option value="date_range">{t('pricing.dateRange')}</option><option value="weekend">{t('pricing.weekend')}</option></select><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('pricing.labelPlaceholder')} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={multiplier} onChange={(event) => setMultiplier(event.target.value)} type="number" min="0.01" step="0.01" placeholder={t('pricing.multiplier')} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} type="number" min="0" step="0.01" placeholder={t('pricing.fixedAmount')} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} type="number" min="1" placeholder={t('pricing.minimumQuantity')} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="-1000" max="1000" placeholder={t('pricing.priority')} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" />{ruleType === 'bundle' && <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-white p-3"><p className="text-xs font-semibold text-gray-700">{t('pricing.bundleProducts')}</p><p className="mt-1 text-[11px] text-gray-500">{t('pricing.bundleProductsHint')}</p><div className="mt-2 grid max-h-28 gap-1 overflow-y-auto sm:grid-cols-2">{productOptions.length ? productOptions.map((product) => <label key={product.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-700 hover:bg-amber-50"><input type="checkbox" checked={bundleProductIds.includes(product.id)} onChange={() => setBundleProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} /><span className="truncate">{product.name}</span></label>) : <span className="text-xs text-gray-400">{t('pricing.noProducts')}</span>}</div></div>}<button type="button" onClick={addRule} disabled={busy || (ruleType === 'bundle' && bundleProductIds.length === 0)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? t('pricing.adding') : t('pricing.add')}</button></div>{message && <p className="mt-2 text-xs text-amber-900">{message}</p>}{rules.length > 0 && <div className="mt-4 space-y-2">{rules.map((rule) => <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs"><div><span className="font-semibold text-gray-800">{rule.label}</span><span className="ml-2 text-gray-500">{rule.rule_type} · {t('pricing.priorityValue', { value: rule.priority ?? 0 })} · {rule.multiplier ? `×${rule.multiplier}` : rule.fixed_amount ? formatMYR(rule.fixed_amount) : t('pricing.configured')}{rule.rule_type === 'bundle' && rule.bundle_product_ids?.length ? ` · ${t('pricing.bundleItems', { count: rule.bundle_product_ids.length })}` : ''}</span></div><button type="button" onClick={() => disableRule(rule.id)} className="font-semibold text-red-600 hover:underline">{t('pricing.disable')}</button></div>)}</div>}</div>;
}
