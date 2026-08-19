import { Search, SlidersHorizontal, X } from 'lucide-react';

interface Option { value: string; label: string }
interface Props { search: string; onSearchChange: (value: string) => void; placeholder?: string; selects?: Array<{ value: string; placeholder: string; options: Option[]; onChange: (value: string) => void }>; onClear?: () => void }

export default function CompactFilterBar({ search, onSearchChange, placeholder = 'Search by name…', selects = [], onClear }: Props) {
  const hasFilters = Boolean(search) || selects.some((select) => Boolean(select.value));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="search" aria-label={placeholder} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10" /></div>
      <div className="flex flex-wrap items-center gap-2"><SlidersHorizontal size={16} aria-hidden="true" className="ml-1 text-gray-400" />{selects.map((select) => <select key={select.placeholder} aria-label={select.placeholder} value={select.value} onChange={(event) => select.onChange(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"><option value="">{select.placeholder}</option>{select.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}{hasFilters && onClear ? <button type="button" aria-label="Clear filters" onClick={onClear} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><X size={14} aria-hidden="true" /> Clear</button> : null}</div>
    </div>
  );
}
