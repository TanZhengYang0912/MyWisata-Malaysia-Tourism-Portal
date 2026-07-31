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
    image: "/assets/customer/malaysia/petronas-twin-towers-vivid.webp",
  },
  {
    state: "Sabah",
    region: "Borneo Malaysia",
    attraction: "Mount Kinabalu",
    tagline: "Borneo's highland icon and nature trails.",
    image: "/assets/customer/malaysia/sabah-mount-kinabalu.webp",
  },
  {
    state: "Penang",
    region: "Northern Malaysia",
    attraction: "George Town",
    tagline: "Street art, heritage shophouses and hawker flavours.",
    image: "/assets/customer/malaysia/penang-george-town.webp",
  },
  {
    state: "Johor",
    region: "Southern Malaysia",
    attraction: "Desaru Coast",
    tagline: "Sea, sun and coastal adventures.",
    image: "/assets/customer/malaysia/johor-desaru-coast.webp",
  },
  {
    state: "Sarawak",
    region: "Borneo Malaysia",
    attraction: "Mulu National Park",
    tagline: "Rainforest caves and dramatic pinnacles.",
    image: "/assets/customer/malaysia/sarawak-mulu-national-park.webp",
  },
  {
    state: "Kedah",
    region: "Northern Malaysia",
    attraction: "Langkawi Sky Bridge",
    tagline: "Island views above the Andaman Sea.",
    image: "/assets/customer/malaysia/kedah-langkawi-sky-bridge.webp",
  },
  {
    state: "Melaka",
    region: "Southern Malaysia",
    attraction: "A Famosa",
    tagline: "History, heritage and riverside evenings.",
    image: "/assets/customer/malaysia/melaka-a-famosa.webp",
  },
  {
    state: "Pahang",
    region: "East Coast Malaysia",
    attraction: "Cameron Highlands",
    tagline: "Tea hills, cool air and slow mornings.",
    image: "/assets/customer/malaysia/pahang-cameron-highlands.webp",
  },
  {
    state: "Terengganu",
    region: "East Coast Malaysia",
    attraction: "Perhentian Islands",
    tagline: "Clear water, coral reefs and island time.",
    image: "/assets/customer/malaysia/terengganu-perhentian-islands.webp",
  },
  {
    state: "Selangor",
    region: "Central Malaysia",
    attraction: "Batu Caves",
    tagline: "A vivid cultural landmark outside Kuala Lumpur.",
    image: "/assets/customer/malaysia/selangor-batu-caves.webp",
  },
  {
    state: "Perak",
    region: "Northern Malaysia",
    attraction: "Kellie's Castle",
    tagline: "A mysterious landmark surrounded by limestone country.",
    image: "/assets/customer/malaysia/perak-kellies-castle.webp",
  },
  {
    state: "Negeri Sembilan",
    region: "Central Malaysia",
    attraction: "Masjid Sri Sendayan",
    tagline: "Striking architecture and Negeri Sembilan warmth.",
    image: "/assets/customer/malaysia/negeri-sembilan-masjid-sri-sendayan.webp",
  },
  {
    state: "Kelantan",
    region: "East Coast Malaysia",
    attraction: "Siti Khadijah Market",
    tagline: "Colourful market life and Kelantanese flavours.",
    image: "/assets/customer/malaysia/kelantan-siti-khadijah-market.webp",
  },
  {
    state: "Perlis",
    region: "Northern Malaysia",
    attraction: "Puncak Wang Kelian",
    tagline: "Border hills, sunrise and open-air adventure.",
    image: "/assets/customer/malaysia/perlis-puncak-wang-kelian.webp",
  },
  {
    state: "Putrajaya",
    region: "Federal Territory",
    attraction: "Putra Mosque",
    tagline: "Pink domes, lakeside views and calm boulevards.",
    image: "/assets/customer/malaysia/putrajaya-putra-mosque.webp",
  },
  {
    state: "Labuan",
    region: "Federal Territory",
    attraction: "Batu Manikar Beach",
    tagline: "Quiet island shores and marine escapes.",
    image: "/assets/customer/malaysia/labuan-batu-manikar-beach.webp",
  },
];

export function getVisibleDestinationQueue<T extends { state: string }>(items: T[], activeState: string, limit: number): T[] {
  return items.filter((item) => item.state !== activeState).slice(0, Math.max(0, limit));
}

export function rotateDestinationQueue<T>(items: T[], index: number): T[] {
  if (items.length < 2 || index < 0 || index >= items.length) return items;
  return [...items.slice(0, index), ...items.slice(index + 1), items[index]];
}
