'use client';

import { CheckSquare, Loader2, X } from 'lucide-react';
import { useState } from 'react';

interface Action { value: string; label: string }
interface Props { selectedCount: number; total: number; allFilteredSelected: boolean; onSelectAllFiltered: () => void; onClear: () => void; onApply: (action: string) => void; actions: Action[]; busy?: boolean; message?: string }

export default function BatchActionBar({ selectedCount, total, allFilteredSelected, onSelectAllFiltered, onClear, onApply, actions, busy = false, message = '' }: Props) {
  const [action, setAction] = useState(actions[0]?.value || '');
  if (!selectedCount && !allFilteredSelected && !message) return null;
  if (!selectedCount && !allFilteredSelected && message) return <div className="rounded-xl border border-primary/20 bg-secondary px-4 py-3 text-xs font-semibold text-primary">{message}</div>;
  const count = allFilteredSelected ? total : selectedCount;
  return <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-secondary px-4 py-3 text-sm md:flex-row md:items-center"><div className="flex items-center gap-2 font-semibold text-primary"><CheckSquare size={16} /> {count.toLocaleString()} selected</div>{!allFilteredSelected && selectedCount < total && <button type="button" onClick={onSelectAllFiltered} className="text-left text-xs font-semibold text-primary hover:underline">Select all {total.toLocaleString()} filtered results</button>}{allFilteredSelected && <span className="text-xs text-primary">All filtered results selected</span>}<div className="flex flex-1 items-center gap-2 md:justify-end"><select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-lg border border-primary/20 bg-white px-3 py-2 text-xs font-semibold text-gray-700">{actions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" disabled={busy || !action} onClick={() => onApply(action)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Apply</button><button type="button" onClick={onClear} title="Clear selection" className="rounded-lg p-2 text-primary hover:bg-secondary/80"><X size={15} /></button></div>{message && <span className="text-xs text-primary md:absolute md:ml-48">{message}</span>}</div>;
}
