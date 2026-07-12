export interface OutletDisplayInput {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  id?: string | null;
}

/** Keep the vendor brand in the database, but make repeated outlet labels scannable. */
export function outletShortName(name?: string | null, vendorName?: string | null) {
  const value = (name || '').trim();
  if (!value) return 'Unassigned outlet';
  const prefixes = vendorName ? [`${vendorName.trim()} — `, `${vendorName.trim()} – `, `${vendorName.trim()} - `] : [];
  const prefixed = prefixes.find((prefix) => value.startsWith(prefix));
  if (prefixed) return value.slice(prefixed.length).trim() || value;
  const separator = value.indexOf(' — ');
  return separator > 0 ? value.slice(separator + 3).trim() || value : value;
}

export function outletLocation(city?: string | null, state?: string | null) {
  return [city, state].filter(Boolean).join(', ') || 'Malaysia';
}

export function outletIdLabel(id?: string | null) {
  return id ? `ID ${id.slice(0, 8).toUpperCase()}` : 'No outlet ID';
}

export function outletDisplay(outlet: OutletDisplayInput, vendorName?: string | null) {
  return {
    name: outletShortName(outlet.name, vendorName),
    location: outletLocation(outlet.city, outlet.state),
    id: outletIdLabel(outlet.id),
  };
}
