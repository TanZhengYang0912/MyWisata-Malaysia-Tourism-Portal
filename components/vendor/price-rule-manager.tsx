'use client';

import { useEffect, useState } from 'react';

type PriceRule = { id: string; rule_type: string; label: string; multiplier: number | null; fixed_amount: number | null; min_quantity: number | null; priority: number; is_active: boolean };

export default function PriceRuleManager({ vendorId, productId }: { vendorId: string; productId: string }) {
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [ruleType, setRuleType] = useState('peak');
  const [label, setLabel] = useState('');
  const [multiplier, setMultiplier] = useState('1.2');
  const [fixedAmount, setFixedAmount] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [priority, setPriority] = useState('0');
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
    if (!label.trim()) { setMessage('Add a label for this pricing rule.'); return; }
    setBusy(true); setMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleType, label: label.trim(), multiplier: multiplier ? Number(multiplier) : undefined, fixedAmount: fixedAmount ? Number(fixedAmount) : undefined, minQuantity: minQuantity ? Number(minQuantity) : undefined, priority: Number(priority) || 0 }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || 'Could not add pricing rule.'); return; }
    setLabel(''); setFixedAmount(''); setMinQuantity(''); setMessage('Pricing rule added and sent for review.'); void load();
  }

  async function disableRule(ruleId: string) {
    await fetch(`/api/vendors/${vendorId}/products/${productId}/price-rules/${ruleId}`, { method: 'DELETE' });
    void load();
  }

  return <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/50 p-4"><div><p className="text-sm font-semibold text-gray-900">Variable pricing</p><p className="mt-1 text-xs text-gray-600">Peak, off-peak, group, bundle and tier rules can be combined with the base price. Higher priority wins.</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={ruleType} onChange={(event) => setRuleType(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><option value="peak">Peak multiplier</option><option value="off_peak">Off-peak multiplier</option><option value="group_size">Group size</option><option value="tiered">Tiered quantity</option><option value="bundle">Bundle</option><option value="date_range">Date range</option><option value="weekend">Weekend</option></select><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Rule label, e.g. Weekend peak" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={multiplier} onChange={(event) => setMultiplier(event.target.value)} type="number" min="0.01" step="0.01" placeholder="Multiplier" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={fixedAmount} onChange={(event) => setFixedAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="Fixed amount override" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} type="number" min="1" placeholder="Minimum quantity" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" min="-1000" max="1000" placeholder="Priority" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={addRule} disabled={busy} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Adding…' : 'Add pricing rule'}</button></div>{message && <p className="mt-2 text-xs text-amber-900">{message}</p>}{rules.length > 0 && <div className="mt-4 space-y-2">{rules.map((rule) => <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs"><div><span className="font-semibold text-gray-800">{rule.label}</span><span className="ml-2 text-gray-500">{rule.rule_type} · priority {rule.priority ?? 0} · {rule.multiplier ? `×${rule.multiplier}` : rule.fixed_amount ? `RM ${rule.fixed_amount}` : 'configured'}</span></div><button type="button" onClick={() => disableRule(rule.id)} className="font-semibold text-red-600 hover:underline">Disable</button></div>)}</div>}</div>;
}
