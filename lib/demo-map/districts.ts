/**
 * Malaysia's second administrative level — Daerah (district).
 *
 * `seed` is an approximate district centre as [lng, lat], matching the
 * [lng, lat] convention of DEMO_STATES.label. The map does not have real
 * district boundary geometry; it partitions each state's own polygon around
 * these seeds (see ./district-cells). Swap in a real district GeoJSON later and
 * the seeds become label anchors only.
 *
 * The three Federal Territories and Perlis have no districts — Perlis goes
 * straight from state to mukim. An empty list is correct, not missing data.
 */
export interface DemoDistrict {
  id: string;
  name: string;
  seed: [number, number];
}

function district(name: string, lng: number, lat: number): DemoDistrict {
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, seed: [lng, lat] };
}

/** Keyed by DEMO_STATES.id. */
export const DEMO_DISTRICTS: Record<string, DemoDistrict[]> = {
  johor: [
    district("Batu Pahat", 102.93, 1.85), district("Johor Bahru", 103.74, 1.49),
    district("Kluang", 103.32, 2.03), district("Kota Tinggi", 103.9, 1.74),
    district("Kulai", 103.6, 1.66), district("Mersing", 103.84, 2.43),
    district("Muar", 102.57, 2.05), district("Pontian", 103.39, 1.48),
    district("Segamat", 102.82, 2.51), district("Tangkak", 102.55, 2.27),
  ],
  kedah: [
    district("Baling", 100.92, 5.68), district("Bandar Baharu", 100.53, 5.11),
    district("Kota Setar", 100.37, 6.12), district("Kuala Muda", 100.47, 5.6),
    district("Kubang Pasu", 100.45, 6.4), district("Kulim", 100.56, 5.37),
    district("Langkawi", 99.8, 6.35), district("Padang Terap", 100.72, 6.28),
    district("Pendang", 100.48, 5.99), district("Pokok Sena", 100.55, 6.05),
    district("Sik", 100.74, 5.82), district("Yan", 100.38, 5.8),
  ],
  kelantan: [
    district("Bachok", 102.4, 6.07), district("Gua Musang", 101.97, 4.88),
    district("Jeli", 101.84, 5.7), district("Kota Bharu", 102.24, 6.13),
    district("Kuala Krai", 102.2, 5.53), district("Machang", 102.22, 5.77),
    district("Pasir Mas", 102.14, 6.05), district("Pasir Puteh", 102.4, 5.83),
    district("Tanah Merah", 102.15, 5.81), district("Tumpat", 102.17, 6.2),
  ],
  melaka: [
    district("Alor Gajah", 102.21, 2.38), district("Melaka Tengah", 102.25, 2.21),
    district("Jasin", 102.43, 2.31),
  ],
  "negeri-sembilan": [
    district("Jelebu", 102.07, 3.02), district("Jempol", 102.37, 2.83),
    district("Kuala Pilah", 102.25, 2.74), district("Port Dickson", 101.8, 2.52),
    district("Rembau", 102.09, 2.59), district("Seremban", 101.94, 2.73),
    district("Tampin", 102.23, 2.47),
  ],
  pahang: [
    district("Bentong", 101.91, 3.52), district("Bera", 102.62, 3.3),
    district("Cameron Highlands", 101.38, 4.47), district("Jerantut", 102.36, 3.94),
    district("Kuantan", 103.33, 3.81), district("Lipis", 101.98, 4.19),
    district("Maran", 102.77, 3.58), district("Pekan", 103.39, 3.49),
    district("Raub", 101.86, 3.79), district("Rompin", 103.42, 2.81),
    district("Temerloh", 102.42, 3.45),
  ],
  penang: [
    district("Timur Laut", 100.31, 5.42), district("Barat Daya", 100.23, 5.34),
    district("Seberang Perai Utara", 100.44, 5.44),
    district("Seberang Perai Tengah", 100.45, 5.35),
    district("Seberang Perai Selatan", 100.48, 5.2),
  ],
  perak: [
    district("Bagan Datuk", 100.79, 4.0), district("Batang Padang", 101.25, 4.05),
    district("Hilir Perak", 100.98, 4.02), district("Hulu Perak", 101.3, 5.42),
    district("Kampar", 101.15, 4.31), district("Kerian", 100.65, 5.1),
    district("Kinta", 101.09, 4.6), district("Kuala Kangsar", 100.94, 4.77),
    district("Larut Matang & Selama", 100.74, 4.86), district("Manjung", 100.7, 4.23),
    district("Muallim", 101.52, 3.9), district("Perak Tengah", 100.93, 4.34),
  ],
  // Perlis is the only state with no district tier — it goes state -> mukim.
  perlis: [],
  selangor: [
    district("Gombak", 101.7, 3.25), district("Hulu Langat", 101.83, 3.1),
    district("Hulu Selangor", 101.55, 3.55), district("Klang", 101.44, 3.04),
    district("Kuala Langat", 101.51, 2.83), district("Kuala Selangor", 101.25, 3.35),
    district("Petaling", 101.6, 3.08), district("Sabak Bernam", 101.05, 3.72),
    district("Sepang", 101.72, 2.72),
  ],
  terengganu: [
    district("Besut", 102.55, 5.75), district("Dungun", 103.32, 4.78),
    district("Hulu Terengganu", 102.85, 5.05), district("Kemaman", 103.42, 4.23),
    district("Kuala Terengganu", 103.14, 5.33), district("Marang", 103.2, 5.2),
    district("Setiu", 102.8, 5.55),
  ],
  // Sabah and Sarawak are organised into divisions above the district tier, and
  // their district lists change as sub-districts get upgraded. These are the
  // main ones; not an exhaustive list.
  sabah: [
    district("Kota Kinabalu", 116.07, 5.98), district("Penampang", 116.1, 5.92),
    district("Papar", 115.93, 5.73), district("Tuaran", 116.23, 6.18),
    district("Kota Belud", 116.43, 6.35), district("Kudat", 116.84, 6.88),
    district("Kota Marudu", 116.75, 6.5), district("Ranau", 116.67, 5.95),
    district("Sandakan", 118.12, 5.84), district("Beluran", 117.5, 5.8),
    district("Lahad Datu", 118.33, 5.02), district("Tawau", 117.89, 4.25),
    district("Semporna", 118.61, 4.48), district("Keningau", 116.16, 5.34),
    district("Beaufort", 115.74, 5.35), district("Sipitang", 115.55, 5.08),
  ],
  sarawak: [
    district("Kuching", 110.34, 1.55), district("Samarahan", 110.48, 1.46),
    district("Serian", 110.57, 1.16), district("Sri Aman", 111.46, 1.24),
    district("Betong", 111.53, 1.4), district("Sarikei", 111.52, 2.13),
    district("Sibu", 111.83, 2.29), district("Mukah", 112.09, 2.9),
    district("Bintulu", 113.04, 3.17), district("Kapit", 112.93, 2.02),
    district("Miri", 113.99, 4.4), district("Limbang", 115.0, 4.75),
    district("Lawas", 115.4, 4.85),
  ],
  // Federal Territories have no districts.
  "kuala-lumpur": [],
  putrajaya: [],
  labuan: [],
};

/**
 * Which district each seeded city sits in. The outlets table has no district
 * column yet, so the demo derives it from city — see
 * docs/plans/2026-08-01-1049-state-district-navigation-layer.md Phase 1.
 *
 * Kuala Lumpur is deliberately absent: a Federal Territory has no district.
 */
export const CITY_TO_DISTRICT: Record<string, string> = {
  "George Town": "Timur Laut",
  "Air Itam": "Timur Laut",
  "Batu Ferringhi": "Timur Laut",
  Ipoh: "Kinta",
  "Kota Kinabalu": "Kota Kinabalu",
  Sandakan: "Sandakan",
  Kuching: "Kuching",
  Melaka: "Melaka Tengah",
  Kuah: "Langkawi",
  "Kota Bharu": "Kota Bharu",
  "Johor Bahru": "Johor Bahru",
  Seremban: "Seremban",
  "Kuala Terengganu": "Kuala Terengganu",
  Kuantan: "Kuantan",
};

export function getDistricts(stateId: string): DemoDistrict[] {
  return DEMO_DISTRICTS[stateId] ?? [];
}
