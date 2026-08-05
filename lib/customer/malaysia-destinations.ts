export type MalaysiaDestination = {
  state: string;
  region: string;
  attraction: string;
  tagline: string;
  intro: string;
  highlights: readonly [string, string, string];
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
    intro: "Malaysia's energetic capital pairs a modern skyline with neighbourhood food, shopping and city culture.",
    highlights: ["City life", "Food", "Shopping"],
    image: "/assets/customer/malaysia/petronas-twin-towers-vivid.webp",
  },
  {
    state: "Sabah",
    region: "Borneo Malaysia",
    attraction: "Mount Kinabalu",
    tagline: "Borneo's highland icon and nature trails.",
    intro: "A nature-rich destination shaped by mountain air, island waters and Borneo wildlife.",
    highlights: ["Mountains", "Islands", "Wildlife"],
    image: "/assets/customer/malaysia/sabah-mount-kinabalu.webp",
  },
  {
    state: "Penang",
    region: "Northern Malaysia",
    attraction: "George Town",
    tagline: "Street art, heritage shophouses and hawker flavours.",
    intro: "A culture-and-food favourite where George Town heritage meets creative streets and coastal escapes.",
    highlights: ["Heritage", "Food", "Street art"],
    image: "/assets/customer/malaysia/penang-george-town.webp",
  },
  {
    state: "Johor",
    region: "Southern Malaysia",
    attraction: "Desaru Coast",
    tagline: "Sea, sun and coastal adventures.",
    intro: "A sunny southern getaway for coastlines, family days and easy island-facing escapes.",
    highlights: ["Coast", "Family", "Seafood"],
    image: "/assets/customer/malaysia/johor-desaru-coast.webp",
  },
  {
    state: "Sarawak",
    region: "Borneo Malaysia",
    attraction: "Mulu National Park",
    tagline: "Rainforest caves and dramatic pinnacles.",
    intro: "A rainforest destination known for limestone landscapes, caves and deep local culture.",
    highlights: ["Rainforest", "Caves", "Culture"],
    image: "/assets/customer/malaysia/sarawak-mulu-national-park.webp",
  },
  {
    state: "Kedah",
    region: "Northern Malaysia",
    attraction: "Langkawi Sky Bridge",
    tagline: "Island views above the Andaman Sea.",
    intro: "An island-view escape with dramatic coastlines, sea air and elevated viewpoints.",
    highlights: ["Islands", "Views", "Coast"],
    image: "/assets/customer/malaysia/kedah-langkawi-sky-bridge.webp",
  },
  {
    state: "Melaka",
    region: "Southern Malaysia",
    attraction: "A Famosa",
    tagline: "History, heritage and riverside evenings.",
    intro: "A riverside heritage city where layered history meets local flavours and evening walks.",
    highlights: ["Heritage", "Food", "Riverside"],
    image: "/assets/customer/malaysia/melaka-a-famosa.webp",
  },
  {
    state: "Pahang",
    region: "East Coast Malaysia",
    attraction: "Cameron Highlands",
    tagline: "Tea hills, cool air and slow mornings.",
    intro: "Cooler highlands and green landscapes make Pahang a slower, nature-led escape.",
    highlights: ["Highlands", "Tea", "Nature"],
    image: "/assets/customer/malaysia/pahang-cameron-highlands.webp",
  },
  {
    state: "Terengganu",
    region: "East Coast Malaysia",
    attraction: "Perhentian Islands",
    tagline: "Clear water, coral reefs and island time.",
    intro: "Clear water, island time and east-coast warmth define this relaxed marine destination.",
    highlights: ["Islands", "Diving", "Coast"],
    image: "/assets/customer/malaysia/terengganu-perhentian-islands.webp",
  },
  {
    state: "Selangor",
    region: "Central Malaysia",
    attraction: "Batu Caves",
    tagline: "A vivid cultural landmark outside Kuala Lumpur.",
    intro: "A lively gateway around Kuala Lumpur with cultural landmarks, caves and local food.",
    highlights: ["Culture", "Landmarks", "Food"],
    image: "/assets/customer/malaysia/selangor-batu-caves.webp",
  },
  {
    state: "Perak",
    region: "Northern Malaysia",
    attraction: "Kellie's Castle",
    tagline: "A mysterious landmark surrounded by limestone country.",
    intro: "Limestone country, heritage towns and quiet stories make Perak rewarding to explore slowly.",
    highlights: ["Limestone", "Heritage", "Nature"],
    image: "/assets/customer/malaysia/perak-kellies-castle.webp",
  },
  {
    state: "Negeri Sembilan",
    region: "Central Malaysia",
    attraction: "Masjid Sri Sendayan",
    tagline: "Striking architecture and Negeri Sembilan warmth.",
    intro: "A welcoming destination for distinctive architecture, local traditions and relaxed escapes.",
    highlights: ["Architecture", "Culture", "Slow travel"],
    image: "/assets/customer/malaysia/negeri-sembilan-masjid-sri-sendayan.webp",
  },
  {
    state: "Kelantan",
    region: "East Coast Malaysia",
    attraction: "Siti Khadijah Market",
    tagline: "Colourful market life and Kelantanese flavours.",
    intro: "A colourful east-coast state full of market life, craft traditions and bold local flavours.",
    highlights: ["Markets", "Craft", "Food"],
    image: "/assets/customer/malaysia/kelantan-siti-khadijah-market.webp",
  },
  {
    state: "Perlis",
    region: "Northern Malaysia",
    attraction: "Puncak Wang Kelian",
    tagline: "Border hills, sunrise and open-air adventure.",
    intro: "Malaysia's smallest state offers open landscapes, border hills and unhurried outdoor moments.",
    highlights: ["Hills", "Sunrise", "Outdoors"],
    image: "/assets/customer/malaysia/perlis-puncak-wang-kelian.webp",
  },
  {
    state: "Putrajaya",
    region: "Federal Territory",
    attraction: "Putra Mosque",
    tagline: "Pink domes, lakeside views and calm boulevards.",
    intro: "A calm planned city of pink domes, lakeside views and spacious boulevards.",
    highlights: ["Architecture", "Lakes", "Calm"],
    image: "/assets/customer/malaysia/putrajaya-putra-mosque.webp",
  },
  {
    state: "Labuan",
    region: "Federal Territory",
    attraction: "Batu Manikar Beach",
    tagline: "Quiet island shores and marine escapes.",
    intro: "A quiet island escape for beaches, marine views and a slower coastal rhythm.",
    highlights: ["Beaches", "Marine life", "Island time"],
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
