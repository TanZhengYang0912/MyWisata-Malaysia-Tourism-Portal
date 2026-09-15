// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { apiFail, apiOk } from "@/lib/validation/schemas";
import type { GeoHit } from "@/lib/routing";

export const dynamic = "force-dynamic";

// Free forward-geocoding for the map Start editor's real-time autocomplete:
//  • ORS (Pelias) when ORS_API_KEY is set, else
//  • Nominatim (OpenStreetMap) as a no-key fallback.
// Returns up to 5 ranked suggestions so the client can validate-as-you-type.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return apiOk({ results: [] as GeoHit[] });

  const key = process.env.ORS_API_KEY;
  const results = (key ? await geocodeViaOrs(q, key) : null) ?? (await geocodeViaNominatim(q)) ?? [];
  return apiOk({ results });
}

async function geocodeViaOrs(q: string, key: string): Promise<GeoHit[] | null> {
  try {
    const params = new URLSearchParams({ api_key: key, text: q, "boundary.country": "MY", size: "5" });
    const res = await fetch(`https://api.openrouteservice.org/geocode/search?${params.toString()}`);
    if (!res.ok) return null;
    const geojson = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { label?: string } }> };
    const hits = (geojson.features ?? [])
      .map((f) => (f.geometry?.coordinates ? { label: f.properties?.label ?? q, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null))
      .filter((h): h is GeoHit => h !== null);
    return hits;
  } catch {
    return null;
  }
}

async function geocodeViaNominatim(q: string): Promise<GeoHit[] | null> {
  try {
    const params = new URLSearchParams({ q, format: "json", countrycodes: "my", limit: "5" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "MyLawatan/1.0 (tourism-portal)" }, // Nominatim policy requires an identifying UA.
    });
    if (!res.ok) return null;
    const hits = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    return hits
      .map((h) => (h.lat && h.lon ? { label: h.display_name ?? q, lat: Number(h.lat), lng: Number(h.lon) } : null))
      .filter((h): h is GeoHit => h !== null);
  } catch {
    return null;
  }
}
