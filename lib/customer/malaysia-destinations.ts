import { placeImageUrl } from "@/lib/storage/place-image";

export type MalaysiaDestination = {
  state: string;
  zone: string;
  attraction: string;
  tagline: string;
  intro: string;
  highlights: readonly [string, string, string];
  image: string;
};

// Wikimedia Commons images are used as an initial, real-photo content set.
// Replace with approved production assets once photo licensing is confirmed.
const DESTINATION_SOURCES: MalaysiaDestination[] = [
  {
    state: "Kuala Lumpur",
    zone: "Federal Territory",
    attraction: "Petronas Twin Towers",
    tagline: "Malaysia's modern skyline in one glance.",
    intro: "Malaysia's energetic capital pairs a modern skyline with neighbourhood food, shopping and city culture.",
    highlights: ["City life", "Food", "Shopping"],
    image: "malaysia/petronas-twin-towers-vivid.webp",
  },
  {
    state: "Sabah",
    zone: "Borneo Malaysia",
    attraction: "Mount Kinabalu",
    tagline: "Borneo's highland icon and nature trails.",
    intro: "A nature-rich destination shaped by mountain air, island waters and Borneo wildlife.",
    highlights: ["Mountains", "Islands", "Wildlife"],
    image: "malaysia/sabah-mount-kinabalu.webp",
  },
  {
    state: "Penang",
    zone: "Northern Malaysia",
    attraction: "George Town",
    tagline: "Street art, heritage shophouses and hawker flavours.",
    intro: "A culture-and-food favourite where George Town heritage meets creative streets and coastal escapes.",
    highlights: ["Heritage", "Food", "Street art"],
    image: "malaysia/penang-george-town.webp",
  },
  {
    state: "Melaka",
    zone: "Southern Malaysia",
    attraction: "A Famosa",
    tagline: "History, heritage and riverside evenings.",
    intro: "A riverside heritage city where layered history meets local flavours and evening walks.",
    highlights: ["Heritage", "Food", "Riverside"],
    image: "malaysia/melaka-a-famosa.webp",
  },
  {
    state: "Johor",
    zone: "Southern Malaysia",
    attraction: "Desaru Coast",
    tagline: "Sea, sun and coastal adventures.",
    intro: "A sunny southern getaway for coastlines, family days and easy island-facing escapes.",
    highlights: ["Coast", "Family", "Seafood"],
    image: "malaysia/johor-desaru-coast.webp",
  },
  {
    state: "Sarawak",
    zone: "Borneo Malaysia",
    attraction: "Mulu National Park",
    tagline: "Rainforest caves and dramatic pinnacles.",
    intro: "A rainforest destination known for limestone landscapes, caves and deep local culture.",
    highlights: ["Rainforest", "Caves", "Culture"],
    image: "malaysia/sarawak-mulu-national-park.webp",
  },
  {
    state: "Kedah",
    zone: "Northern Malaysia",
    attraction: "Langkawi Sky Bridge",
    tagline: "Island views above the Andaman Sea.",
    intro: "An island-view escape with dramatic coastlines, sea air and elevated viewpoints.",
    highlights: ["Islands", "Views", "Coast"],
    image: "malaysia/kedah-langkawi-sky-bridge.webp",
  },
  {
    state: "Pahang",
    zone: "East Coast Malaysia",
    attraction: "Cameron Highlands",
    tagline: "Tea hills, cool air and slow mornings.",
    intro: "Cooler highlands and green landscapes make Pahang a slower, nature-led escape.",
    highlights: ["Highlands", "Tea", "Nature"],
    image: "malaysia/pahang-cameron-highlands.webp",
  },
  {
    state: "Terengganu",
    zone: "East Coast Malaysia",
    attraction: "Perhentian Islands",
    tagline: "Clear water, coral reefs and island time.",
    intro: "Clear water, island time and east-coast warmth define this relaxed marine destination.",
    highlights: ["Islands", "Diving", "Coast"],
    image: "malaysia/terengganu-perhentian-islands.webp",
  },
  {
    state: "Selangor",
    zone: "Central Malaysia",
    attraction: "Batu Caves",
    tagline: "A vivid cultural landmark outside Kuala Lumpur.",
    intro: "A lively gateway around Kuala Lumpur with cultural landmarks, caves and local food.",
    highlights: ["Culture", "Landmarks", "Food"],
    image: "malaysia/selangor-batu-caves.webp",
  },
  {
    state: "Perak",
    zone: "Northern Malaysia",
    attraction: "Kellie's Castle",
    tagline: "A mysterious landmark surrounded by limestone country.",
    intro: "Limestone country, heritage towns and quiet stories make Perak rewarding to explore slowly.",
    highlights: ["Limestone", "Heritage", "Nature"],
    image: "malaysia/perak-kellies-castle.webp",
  },
  {
    state: "Negeri Sembilan",
    zone: "Central Malaysia",
    attraction: "Masjid Sri Sendayan",
    tagline: "Striking architecture and Negeri Sembilan warmth.",
    intro: "A welcoming destination for distinctive architecture, local traditions and relaxed escapes.",
    highlights: ["Architecture", "Culture", "Slow travel"],
    image: "malaysia/negeri-sembilan-masjid-sri-sendayan.webp",
  },
  {
    state: "Kelantan",
    zone: "East Coast Malaysia",
    attraction: "Siti Khadijah Market",
    tagline: "Colourful market life and Kelantanese flavours.",
    intro: "A colourful east-coast state full of market life, craft traditions and bold local flavours.",
    highlights: ["Markets", "Craft", "Food"],
    image: "malaysia/kelantan-siti-khadijah-market.webp",
  },
  {
    state: "Perlis",
    zone: "Northern Malaysia",
    attraction: "Puncak Wang Kelian",
    tagline: "Border hills, sunrise and open-air adventure.",
    intro: "Malaysia's smallest state offers open landscapes, border hills and unhurried outdoor moments.",
    highlights: ["Hills", "Sunrise", "Outdoors"],
    image: "malaysia/perlis-puncak-wang-kelian.webp",
  },
  {
    state: "Putrajaya",
    zone: "Federal Territory",
    attraction: "Putra Mosque",
    tagline: "Pink domes, lakeside views and calm boulevards.",
    intro: "A calm planned city of pink domes, lakeside views and spacious boulevards.",
    highlights: ["Architecture", "Lakes", "Calm"],
    image: "malaysia/putrajaya-putra-mosque.webp",
  },
  {
    state: "Labuan",
    zone: "Federal Territory",
    attraction: "Batu Manikar Beach",
    tagline: "Quiet island shores and marine escapes.",
    intro: "A quiet island escape for beaches, marine views and a slower coastal rhythm.",
    highlights: ["Beaches", "Marine life", "Island time"],
    image: "malaysia/labuan-batu-manikar-beach.webp",
  },
];

export const MALAYSIA_DESTINATIONS: MalaysiaDestination[] = DESTINATION_SOURCES.map((destination) => ({
  ...destination,
  image: placeImageUrl(destination.image) ?? destination.image,
}));

export function destinationHref(state: string): string {
  const slug = state.trim().toLowerCase().replace(/\s+/g, "-");
  return `/customer/destination/${slug}`;
}

export function getVisibleDestinationQueue<T extends { state: string }>(items: T[], activeState: string, limit: number): T[] {
  return items.filter((item) => item.state !== activeState).slice(0, Math.max(0, limit));
}

export function rotateDestinationQueue<T>(items: T[], index: number): T[] {
  if (items.length < 2 || index < 0 || index >= items.length) return items;
  return [...items.slice(0, index), ...items.slice(index + 1), items[index]];
}
