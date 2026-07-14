export type MalaysiaDestination = {
  state: string;
  region: string;
  attraction: string;
  tagline: string;
  image: string;
};

// Wikimedia Commons images are used as an initial, real-photo content set.
// Replace with approved production assets once photo licensing is confirmed.
export const MALAYSIA_DESTINATIONS: MalaysiaDestination[] = [
  {
    state: "Kuala Lumpur",
    region: "Federal Territory",
    attraction: "Petronas Twin Towers",
    tagline: "Malaysia's modern skyline in one glance.",
    image: "https://upload.wikimedia.org/wikipedia/commons/b/bf/2016_Kuala_Lumpur%2C_Petronas_Towers_%2821%29.jpg",
  },
  {
    state: "Sabah",
    region: "Borneo Malaysia",
    attraction: "Mount Kinabalu",
    tagline: "Borneo's highland icon and nature trails.",
    image: "https://upload.wikimedia.org/wikipedia/commons/2/27/Morning_view_of_Mount_Kinabalu_in_Malaysia%2C_with_its_peak_clearly_visible.jpg",
  },
  {
    state: "Penang",
    region: "Northern Malaysia",
    attraction: "George Town",
    tagline: "Street art, heritage shophouses and hawker flavours.",
    image: "https://upload.wikimedia.org/wikipedia/commons/f/f1/Beach_Street%2C_George_Town_01.jpg",
  },
  {
    state: "Johor",
    region: "Southern Malaysia",
    attraction: "Desaru Coast",
    tagline: "Sea, sun and coastal adventures.",
    image: "https://upload.wikimedia.org/wikipedia/commons/d/d6/Desaru_Coast_Adventure_Waterpark.jpg",
  },
  {
    state: "Sarawak",
    region: "Borneo Malaysia",
    attraction: "Mulu National Park",
    tagline: "Rainforest caves and dramatic pinnacles.",
    image: "https://upload.wikimedia.org/wikipedia/commons/5/55/Mulu_Pinnacles.jpg",
  },
  {
    state: "Kedah",
    region: "Northern Malaysia",
    attraction: "Langkawi Sky Bridge",
    tagline: "Island views above the Andaman Sea.",
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c8/Langkawi_Malaysia_Langkawi-Sky-Bridge-01.jpg",
  },
  {
    state: "Melaka",
    region: "Southern Malaysia",
    attraction: "A Famosa",
    tagline: "History, heritage and riverside evenings.",
    image: "https://upload.wikimedia.org/wikipedia/commons/8/80/Melaka_Malaysia_A-Famosa-01.jpg",
  },
  {
    state: "Pahang",
    region: "East Coast Malaysia",
    attraction: "Cameron Highlands",
    tagline: "Tea hills, cool air and slow mornings.",
    image: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Cameron_Bharat_Tea_Plantation%2C_Cameron_Highlands%2C_Malaysia%2C_20250829_1535_4120.jpg",
  },
  {
    state: "Terengganu",
    region: "East Coast Malaysia",
    attraction: "Perhentian Islands",
    tagline: "Clear water, coral reefs and island time.",
    image: "https://upload.wikimedia.org/wikipedia/commons/8/8b/Perhentian_Islands%2C_Malaysia%2C_Afterglow.jpg",
  },
  {
    state: "Selangor",
    region: "Central Malaysia",
    attraction: "Batu Caves",
    tagline: "A vivid cultural landmark outside Kuala Lumpur.",
    image: "https://upload.wikimedia.org/wikipedia/commons/5/56/Gombak_Selangor_Batu-Caves-01.jpg",
  },
  {
    state: "Perak",
    region: "Northern Malaysia",
    attraction: "Kellie's Castle",
    tagline: "A mysterious landmark surrounded by limestone country.",
    image: "https://upload.wikimedia.org/wikipedia/commons/6/68/The_majestic_Kellie%27s_Castle.png",
  },
  {
    state: "Negeri Sembilan",
    region: "Central Malaysia",
    attraction: "Masjid Sri Sendayan",
    tagline: "Striking architecture and Negeri Sembilan warmth.",
    image: "https://upload.wikimedia.org/wikipedia/commons/0/05/Masjid_Sri_Sendayan_2.jpg",
  },
  {
    state: "Kelantan",
    region: "East Coast Malaysia",
    attraction: "Siti Khadijah Market",
    tagline: "Colourful market life and Kelantanese flavours.",
    image: "https://upload.wikimedia.org/wikipedia/commons/5/5e/Pasar_Besar_Siti_Khadijah%2C_Kota_Bharu%2C_Malaysia_%284014429550%29.jpg",
  },
  {
    state: "Perlis",
    region: "Northern Malaysia",
    attraction: "Puncak Wang Kelian",
    tagline: "Border hills, sunrise and open-air adventure.",
    image: "https://upload.wikimedia.org/wikipedia/commons/0/04/Puncak_Wang_Kelian_-_2025.jpg",
  },
  {
    state: "Putrajaya",
    region: "Federal Territory",
    attraction: "Putra Mosque",
    tagline: "Pink domes, lakeside views and calm boulevards.",
    image: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Putra_Mosque_being_reflected_in_the_lake_%28crop%29.jpg",
  },
  {
    state: "Labuan",
    region: "Federal Territory",
    attraction: "Batu Manikar Beach",
    tagline: "Quiet island shores and marine escapes.",
    image: "https://upload.wikimedia.org/wikipedia/commons/0/03/Batu_Manikar%2C_Labuan_Island%2C_Malaysia.jpg",
  },
];

export function getVisibleDestinationQueue<T extends { state: string }>(items: T[], activeState: string, limit: number): T[] {
  return items.filter((item) => item.state !== activeState).slice(0, Math.max(0, limit));
}

export function rotateDestinationQueue<T>(items: T[], index: number): T[] {
  if (items.length < 2 || index < 0 || index >= items.length) return items;
  return [...items.slice(0, index), ...items.slice(index + 1), items[index]];
}
