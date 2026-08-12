"use client";

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type RecommendationLocation = { placeId: string | null; name: string; formattedAddress: string; latitude: number; longitude: number };

export function GooglePlacePicker({ value, onChange }: { value: RecommendationLocation | null; onChange: (location: RecommendationLocation) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !input.current || !mapElement.current) { setError('Google Maps is not configured yet.'); return; }
    let cancelled = false;
    setOptions({ key, v: 'weekly' });
    Promise.all([importLibrary('maps'), importLibrary('places')]).then(() => {
      if (cancelled || !input.current || !mapElement.current || !window.google?.maps?.places) return;
      map.current = new window.google.maps.Map(mapElement.current, {
        center: { lat: 3.139, lng: 101.6869 },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      setMapReady(true);
      map.current.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        const point = event.latLng;
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: point }).then(({ results }) => {
          const address = results[0]?.formatted_address ?? `Dropped pin (${point.lat().toFixed(5)}, ${point.lng().toFixed(5)})`;
          onChange({ placeId: results[0]?.place_id ?? null, name: address.split(',')[0] || 'Dropped pin', formattedAddress: address, latitude: point.lat(), longitude: point.lng() });
        }).catch(() => onChange({ placeId: null, name: 'Dropped pin', formattedAddress: `Dropped pin (${point.lat().toFixed(5)}, ${point.lng().toFixed(5)})`, latitude: point.lat(), longitude: point.lng() }));
      });
      const autocomplete = new window.google.maps.places.Autocomplete(input.current, { fields: ['place_id', 'name', 'formatted_address', 'geometry'] });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const point = place.geometry?.location;
        if (!place.name || !place.formatted_address || !point) return;
        const selected = { placeId: place.place_id ?? null, name: place.name, formattedAddress: place.formatted_address, latitude: point.lat(), longitude: point.lng() };
        onChange(selected);
        map.current?.panTo({ lat: selected.latitude, lng: selected.longitude });
        map.current?.setZoom(16);
      });
    }).catch(() => setError('Google Maps could not be loaded. Please try again later.'));
    return () => { cancelled = true; };
  }, [onChange]);

  useEffect(() => {
    if (!mapReady || !map.current || !value) return;
    const position = { lat: value.latitude, lng: value.longitude };
    map.current.panTo(position);
    map.current.setZoom(16);
    marker.current?.setMap(null);
    marker.current = new window.google.maps.Marker({ map: map.current, position, title: value.name });
  }, [mapReady, value]);

  return <div className="space-y-2">
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location from Google Maps</label>
    <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input ref={input} aria-label="Search Google Maps location" placeholder="Search a place or address" className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>
    <div ref={mapElement} aria-label="Google Maps location picker" className="h-64 w-full overflow-hidden rounded-xl border border-border bg-muted" />
    {mapReady && !value && <p className="text-xs text-muted-foreground">Search for a place, or click the map to drop a pin.</p>}
    {value && <div className="flex gap-2 rounded-xl bg-primary/5 p-3 text-xs text-foreground"><MapPin size={15} className="shrink-0 text-primary" /><span><strong>{value.name}</strong><br />{value.formattedAddress}</span></div>}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>;
}
