'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface AddressSelection {
  providerId: string;
  label: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

interface Suggestion {
  providerId: string;
  label: string;
  name: string;
  type: string;
}

interface Props {
  value?: string;
  onChange: (value: string) => void;
  onSelect: (value: AddressSelection) => void;
  placeholder?: string;
}

export default function AddressAutocomplete({ value = '', onChange, onSelect, placeholder = 'Start typing an address…' }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceError, setServiceError] = useState('');

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/address/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) setServiceError(payload.error?.message || 'Local address service is unavailable.');
        else setServiceError('');
        setSuggestions(payload.data || []);
        setOpen(Boolean(payload.data?.length));
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [value]);

  function chooseSuggestion(suggestion: Suggestion) {
    setLoading(true);
    try {
      const selected = suggestion as unknown as AddressSelection;
      onSelect(selected);
      onChange(selected.address || selected.label);
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={16} />
        <Input value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => suggestions.length && setOpen(true)} placeholder={placeholder} className="pl-9 pr-9" autoComplete="off" />
        {loading ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={16} /> : <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />}
      </div>
      {serviceError && <p className="mt-1 text-xs text-amber-700">{serviceError} You can still enter the address manually.</p>}
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button key={suggestion.providerId} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(suggestion)} className="flex w-full items-start gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-0 hover:bg-secondary">
              <MapPin className="mt-0.5 shrink-0 text-primary" size={15} />
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{suggestion.name || suggestion.label}</span><span className="mt-0.5 block truncate text-xs text-gray-500">{suggestion.label}</span></span>
              {suggestion.type && <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-gray-400">{suggestion.type}</span>}
            </button>
          ))}
          <div className="flex items-center gap-1 px-3 py-2 text-[10px] text-gray-400"><Check size={11} /> Address suggestions powered by public Nominatim</div>
        </div>
      )}
    </div>
  );
}
