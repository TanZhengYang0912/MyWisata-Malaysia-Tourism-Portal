import type { ComputedActivity } from "@/backend/core/types";

const PLACE_IMAGES = {
  kedah: "/assets/customer/malaysia/kedah-langkawi-sky-bridge.webp",
  kelantan: "/assets/customer/malaysia/kelantan-siti-khadijah-market.webp",
  melaka: "/assets/customer/malaysia/melaka-a-famosa.webp",
  negeriSembilan: "/assets/customer/malaysia/negeri-sembilan-masjid-sri-sendayan.webp",
  pahang: "/assets/customer/malaysia/pahang-cameron-highlands.webp",
  penang: "/assets/customer/malaysia/penang-george-town.webp",
  perak: "/assets/customer/malaysia/perak-kellies-castle.webp",
  perlis: "/assets/customer/malaysia/perlis-puncak-wang-kelian.webp",
  putrajaya: "/assets/customer/malaysia/putrajaya-putra-mosque.webp",
  sabah: "/assets/customer/malaysia/sabah-mount-kinabalu.webp",
  sarawak: "/assets/customer/malaysia/sarawak-mulu-national-park.webp",
  selangor: "/assets/customer/malaysia/selangor-batu-caves.webp",
  terengganu: "/assets/customer/malaysia/terengganu-perhentian-islands.webp",
  johor: "/assets/customer/malaysia/johor-desaru-coast.webp",
  kualaLumpur: "/assets/customer/malaysia/petronas-twin-towers-vivid.webp",
  labuan: "/assets/customer/malaysia/labuan-batu-manikar-beach.webp",
} as const;

function keyForState(state: string): keyof typeof PLACE_IMAGES | undefined {
  const key = state.toLowerCase().replace(/[^a-z]+(.)/g, (_, letter: string) => letter.toUpperCase());
  return key in PLACE_IMAGES ? key as keyof typeof PLACE_IMAGES : undefined;
}

/** Use the local destination library so a hiking card never inherits a food photo. */
export function getPlaceActivityImage(activity: Pick<ComputedActivity, "name" | "outlet">): string {
  const haystack = `${activity.name} ${activity.outlet.city} ${activity.outlet.state}`.toLowerCase();
  const stateKey = keyForState(activity.outlet.state);

  if (/(hike|trek|trail|mount|waterfall|forest|geoforest|kayak|cave)/.test(haystack)) {
    if (haystack.includes("sabah") || haystack.includes("kinabalu")) return PLACE_IMAGES.sabah;
    if (haystack.includes("sarawak") || haystack.includes("bako") || haystack.includes("mulu")) return PLACE_IMAGES.sarawak;
    if (haystack.includes("kedah") || haystack.includes("langkawi") || haystack.includes("kilim")) return PLACE_IMAGES.kedah;
    if (haystack.includes("pahang") || haystack.includes("tapis") || haystack.includes("cameron")) return PLACE_IMAGES.pahang;
    if (haystack.includes("penang") || haystack.includes("monkey beach")) return PLACE_IMAGES.penang;
  }

  return (stateKey && PLACE_IMAGES[stateKey]) || PLACE_IMAGES.kualaLumpur;
}
