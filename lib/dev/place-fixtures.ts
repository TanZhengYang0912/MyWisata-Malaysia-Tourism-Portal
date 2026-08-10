// DEV ONLY — throwaway fixtures for the place-model prototype (/dev/place-model).
// Nothing here touches Supabase. The point is to feel out whether a three-level
// `places` hierarchy (state → region → poi) reads better than the current
// vendor-first catalogue BEFORE writing a migration. Delete this file and the
// /dev/place-model route to undo the whole experiment.
//
// Shape being tested:
//
//   places (ONE table, self-referencing parent_id, level discriminator)
//     └── product_places (join table with a relation type)
//   vendors → outlets → products   (UNCHANGED — no vendor sits under a place)
//
// The two links between the trees are deliberately different strengths:
//   strong — product_places: "this guide service IS at this trail" (hand-authored)
//   weak   — distance:       "these shops are NEAR the trail"      (computed)

export type PlaceLevel = "state" | "region" | "poi";

/** How a paid product relates to a place. Mirrors Google Things to Do's relation_type. */
export type PlaceRelation =
  | "admission"      // the product gets you in (ADMISSION_TICKET)
  | "guide_service"  // related, but entry is free/irrelevant (RELATED_NO_ADMISSION)
  | "addon";         // extra service, does not admit you (SUPPLEMENTARY_ADDON)

export interface DevPlace {
  id: string;
  parentId: string | null;
  level: PlaceLevel;
  name: string;
  tagline: string;
  intro: string;
  image?: string;
  lat: number;
  lng: number;
  /** null = not applicable (a state has no gate), 0 = free to enter, >0 = RM. */
  entryFee: number | null;
  /** null = nobody operates this place. This is the column the current schema cannot express. */
  managedByVendorId: string | null;
  /** POI-only practical detail — the stuff a vendor page has no field for. */
  detail?: {
    difficulty?: string;
    duration?: string;
    bestTime?: string;
    gettingThere?: string;
  };
}

export type VendorType = "food" | "activity" | "accommodation" | "retail";

export interface DevVendor {
  id: string;
  name: string;
  type: VendorType;
  blurb: string;
  /** Activity vendors that sell guided services have no premises at all. */
  hasOutlets: boolean;
}

export interface DevOutlet {
  id: string;
  vendorId: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
}

export interface DevProduct {
  id: string;
  vendorId: string;
  name: string;
  price: number;
  duration?: string;
  note?: string;
}

export interface DevProductPlace {
  productId: string;
  placeId: string;
  relation: PlaceRelation;
}

// ── Places ──────────────────────────────────────────────────────────────────

export const DEV_PLACES: DevPlace[] = [
  // ---------- Pahang ----------
  {
    id: "pahang",
    parentId: null,
    level: "state",
    name: "Pahang",
    tagline: "Highlands, rainforest and the east coast.",
    intro:
      "Malaysia's largest peninsular state runs from cool tea-country highlands down to open South China Sea beaches.",
    image: "/assets/customer/malaysia/pahang-cameron-highlands.webp",
    lat: 3.8126,
    lng: 103.3256,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "cameron-highlands",
    parentId: "pahang",
    level: "region",
    name: "Cameron Highlands",
    tagline: "Tea terraces, mossy forest and 18°C afternoons.",
    intro:
      "A hill station at 1,500m where tea estates, strawberry farms and montane forest sit within a half-hour drive of each other. Nobody says they are going to Pahang — they say they are going to Cameron.",
    image: "/assets/customer/malaysia/pahang-cameron-highlands.webp",
    lat: 4.47,
    lng: 101.376,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "brinchang-rafflesia-trail",
    parentId: "cameron-highlands",
    level: "poi",
    name: "Gunung Brinchang Rafflesia Trail",
    tagline: "The world's largest flower, off a rough jungle track.",
    intro:
      "Rafflesia bloom on the slopes below Gunung Brinchang for only about five days each. There is no ticket office, no gate and no operator — but the site is hard to find and the last stretch needs a 4WD, so local guides run their own trips up.",
    lat: 4.5203,
    lng: 101.3841,
    entryFee: 0,
    managedByVendorId: null, // ← nobody owns the mountain
    detail: {
      difficulty: "Moderate — steep, muddy, roots and leeches",
      duration: "3–5 hours return",
      bestTime: "Blooms are unpredictable; guides track them week to week",
      gettingThere: "4WD only past Kea Farm; no public transport",
    },
  },
  {
    id: "mossy-forest",
    parentId: "cameron-highlands",
    level: "poi",
    name: "Mossy Forest Boardwalk",
    tagline: "Cloud forest on a raised boardwalk at 2,000m.",
    intro:
      "A protected montane cloud forest with a boardwalk built to keep feet off the root system. Entry is ticketed and managed by the state forestry department.",
    lat: 4.5228,
    lng: 101.3852,
    entryFee: 10,
    managedByVendorId: "v-pahang-forestry", // ← managed, ticketed
    detail: {
      difficulty: "Easy — boardwalk throughout",
      duration: "45 minutes",
      bestTime: "Early morning before the cloud closes in",
      gettingThere: "Road access to Gunung Brinchang summit car park",
    },
  },
  {
    id: "boh-sungai-palas",
    parentId: "cameron-highlands",
    level: "poi",
    name: "BOH Sungai Palas Tea Estate",
    tagline: "Tea terraces with a cantilevered tea room.",
    intro:
      "A working tea estate open to visitors. Walking the terraces and the factory tour are free; the tea room on the ridge is a paid F&B outlet run by the same company.",
    lat: 4.5259,
    lng: 101.3928,
    entryFee: 0,
    managedByVendorId: "v-boh",
    detail: {
      difficulty: "Easy",
      duration: "1–2 hours",
      bestTime: "Weekdays — weekend queues for the tea room are long",
      gettingThere: "Sealed road from Brinchang, parking on site",
    },
  },
  {
    id: "kuantan",
    parentId: "pahang",
    level: "region",
    name: "Kuantan",
    tagline: "The state capital and its city beach.",
    intro: "Pahang's coastal capital, a stop between the highlands and the east-coast islands.",
    lat: 3.8077,
    lng: 103.326,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "teluk-cempedak",
    parentId: "kuantan",
    level: "poi",
    name: "Teluk Cempedak Beach",
    tagline: "Open public beach, ten minutes from town.",
    intro:
      "A free public beach with no gate, no operator and no booking. It exists in the app because travellers look for it — not because anyone sells anything here.",
    lat: 3.813,
    lng: 103.372,
    entryFee: 0,
    managedByVendorId: null, // ← the pure "nobody runs it, nothing is sold" case
    detail: {
      difficulty: "Easy",
      duration: "Open access",
      bestTime: "Avoid the November–February monsoon swell",
      gettingThere: "10 min by car from Kuantan town centre",
    },
  },

  // ---------- Penang ----------
  {
    id: "penang",
    parentId: null,
    level: "state",
    name: "Penang",
    tagline: "Hawker food, heritage shophouses and a national park.",
    intro: "An island state where a UNESCO-listed old town sits half an hour from rainforest coastline.",
    image: "/assets/customer/malaysia/penang-george-town.webp",
    lat: 5.4164,
    lng: 100.3327,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "george-town",
    parentId: "penang",
    level: "region",
    name: "George Town",
    tagline: "Street art, clan jetties and the best hawker street in the country.",
    intro:
      "The UNESCO World Heritage core. Everything here is within walking distance, which is why the region — not the state — is the unit travellers plan around.",
    image: "/assets/customer/malaysia/penang-george-town.webp",
    lat: 5.4141,
    lng: 100.3288,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "armenian-street-art",
    parentId: "george-town",
    level: "poi",
    name: "Armenian Street Murals",
    tagline: "The Kids on Bicycle wall and the lanes around it.",
    intro:
      "A public street. The murals are free to see at any hour and no vendor controls access — but several operators run paid walking tours that start here.",
    lat: 5.4147,
    lng: 100.339,
    entryFee: 0,
    managedByVendorId: null,
    detail: {
      difficulty: "Easy — flat, walkable",
      duration: "1–2 hours to cover the lanes",
      bestTime: "Before 9am to photograph without crowds",
      gettingThere: "Walkable from Komtar; free CAT shuttle stops nearby",
    },
  },
  {
    id: "penang-national-park",
    parentId: "penang",
    level: "region",
    name: "Penang National Park",
    tagline: "Malaysia's smallest national park, at Teluk Bahang.",
    intro: "Coastal rainforest, a meromictic lake and beaches reachable only on foot or by boat.",
    lat: 5.453,
    lng: 100.213,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "monkey-beach-trail",
    parentId: "penang-national-park",
    level: "poi",
    name: "Monkey Beach Trail",
    tagline: "Jungle trek from Teluk Bahang to a quiet cove.",
    intro:
      "Registration at the park office is free. You can walk in unguided, hire a guide, or skip the trek entirely and pay a boatman at the jetty — three different vendors selling three different things at one place.",
    lat: 5.4691,
    lng: 100.1962,
    entryFee: 0,
    managedByVendorId: null,
    detail: {
      difficulty: "Moderate — 2 hours each way, humid, some scrambling",
      duration: "4–5 hours return on foot, 15 min by boat",
      bestTime: "Start before 9am; last boats back around 5pm",
      gettingThere: "Rapid Penang 101 to Teluk Bahang, then the park office",
    },
  },

  // ---------- Melaka — the boundary case ----------
  // Jonker Street is simultaneously a place (a street people travel for) and a
  // strip of ordinary outlets (shops with their own products). It has to appear
  // in BOTH sections without reading as duplication.
  {
    id: "melaka",
    parentId: null,
    level: "state",
    name: "Melaka",
    tagline: "Five hundred years of trade, packed into a few streets.",
    intro: "A small state whose old town carries Portuguese, Dutch, British, Peranakan and Chinese layers within a walkable core.",
    image: "/assets/customer/malaysia/melaka-a-famosa.webp",
    lat: 2.1896,
    lng: 102.2501,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "melaka-city",
    parentId: "melaka",
    level: "region",
    name: "Melaka City",
    tagline: "The UNESCO core, small enough to cross on foot.",
    intro: "Bandar Hilir and the streets across the river. Everything worth seeing is within twenty minutes' walk of the Dutch Square.",
    image: "/assets/customer/malaysia/melaka-a-famosa.webp",
    lat: 2.1943,
    lng: 102.2501,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "jonker-street",
    parentId: "melaka-city",
    level: "poi",
    name: "Jonker Street",
    tagline: "A street that is itself the attraction.",
    intro:
      "Jalan Hang Jebat is free to walk, owned by nobody and open at all hours — yet almost every doorway on it is a business with its own products. The street is the reason people come; the shops are what they do once they arrive.",
    lat: 2.1957,
    lng: 102.247,
    entryFee: 0,
    managedByVendorId: null,
    detail: {
      difficulty: "Easy — flat, pedestrianised on weekend nights",
      duration: "2–3 hours, longer if you eat your way down it",
      bestTime: "Fri–Sun 6pm when the night market closes the street to cars",
      gettingThere: "Walk across the red bridge from the Dutch Square",
    },
  },
  {
    id: "a-famosa",
    parentId: "melaka-city",
    level: "poi",
    name: "A Famosa & St Paul's Hill",
    tagline: "The Portuguese gate and the ruined church above it.",
    intro: "The surviving gatehouse of a 1511 Portuguese fortress, with the shell of St Paul's Church on the hill behind. Open ground, no gate, no ticket.",
    lat: 2.1919,
    lng: 102.2501,
    entryFee: 0,
    managedByVendorId: null,
    detail: {
      difficulty: "Easy — a short flight of steps to the summit",
      duration: "45 minutes",
      bestTime: "Late afternoon, once the hill is in shade",
      gettingThere: "Adjacent to the Dutch Square",
    },
  },

  // ---------- Sabah ----------
  {
    id: "sabah",
    parentId: null,
    level: "state",
    name: "Sabah",
    tagline: "Borneo's mountain, reefs and river wildlife.",
    intro: "The northern tip of Borneo, built around Mount Kinabalu, the Sulu Sea reefs and the Kinabatangan river.",
    image: "/assets/customer/malaysia/sabah-mount-kinabalu.webp",
    lat: 5.9788,
    lng: 116.0753,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "kundasang",
    parentId: "sabah",
    level: "region",
    name: "Kundasang & Ranau",
    tagline: "The village at the foot of the mountain.",
    intro: "The highland base for Kinabalu climbs, with dairy farms and war-memorial gardens.",
    lat: 6.0089,
    lng: 116.5583,
    entryFee: null,
    managedByVendorId: null,
  },
  {
    id: "kinabalu-summit-trail",
    parentId: "kundasang",
    level: "poi",
    name: "Mount Kinabalu Summit Trail",
    tagline: "4,095m, and you cannot walk it without a permit.",
    intro:
      "The opposite extreme from Brinchang: one authority controls the entire mountain. Every climb needs a permit, a licensed mountain guide and a bed at Laban Rata, all sold as packages by the single operator. No third party can sell access here.",
    lat: 6.0333,
    lng: 116.55,
    entryFee: 400,
    managedByVendorId: "v-sabah-parks", // ← fully controlled by one vendor
    detail: {
      difficulty: "Hard — 8.7km, 2,200m ascent over two days",
      duration: "2 days / 1 night",
      bestTime: "Feb–Apr, driest window",
      gettingThere: "2 hours by road from Kota Kinabalu to Timpohon Gate",
    },
  },
];

// ── Vendors ─────────────────────────────────────────────────────────────────
// Note which ones have NO outlets: guide operators sell a service, not a shop.

export const DEV_VENDORS: DevVendor[] = [
  // activity — guides with no premises
  { id: "v-amin-guides", name: "Amin Rafflesia Guides", type: "activity", blurb: "Father-and-son team from Kampung Raja, 4WD included.", hasOutlets: false },
  { id: "v-highland-trekkers", name: "Highland Trekkers", type: "activity", blurb: "Small-group highland treks, English and Mandarin guides.", hasOutlets: false },
  { id: "v-orang-asli-collective", name: "Orang Asli Guide Collective", type: "activity", blurb: "Semai community guides; the people who find the blooms first.", hasOutlets: false },
  { id: "v-gt-walks", name: "George Town Walks", type: "activity", blurb: "Heritage and street-art walking tours, twice daily.", hasOutlets: false },
  { id: "v-teluk-bahang-boats", name: "Teluk Bahang Boat Association", type: "activity", blurb: "Licensed boatmen running the Monkey Beach shuttle.", hasOutlets: false },
  { id: "v-penang-nature-guides", name: "Penang Nature Guides", type: "activity", blurb: "Naturalist-led walks in the national park.", hasOutlets: false },

  // activity — vendors that DO control a place
  { id: "v-sabah-parks", name: "Sabah Parks", type: "activity", blurb: "Statutory body operating Kinabalu Park. Sole permit issuer.", hasOutlets: true },
  { id: "v-pahang-forestry", name: "Pahang Forestry Department", type: "activity", blurb: "Manages the Mossy Forest boardwalk and ticketing.", hasOutlets: true },
  { id: "v-boh", name: "BOH Plantations", type: "food", blurb: "Tea estate, factory and hilltop tea rooms.", hasOutlets: true },

  // food / accommodation / retail — the ordinary vendor→outlet→product shape
  { id: "v-sri-brinchang", name: "Restoran Sri Brinchang", type: "food", blurb: "Banana-leaf and tandoori, open late.", hasOutlets: true },
  { id: "v-cameron-steamboat", name: "Cameron Organic Steamboat", type: "food", blurb: "Highland vegetables straight off the farm.", hasOutlets: true },
  { id: "v-line-clear", name: "Line Clear Nasi Kandar", type: "food", blurb: "Open 24 hours in a Penang Road alley since 1947.", hasOutlets: true },
  { id: "v-chulia-hawker", name: "Chulia Street Night Hawkers", type: "food", blurb: "Char kway teow and wan tan mee after dark.", hasOutlets: true },
  { id: "v-cameron-resort", name: "Cameron Highlands Resort", type: "accommodation", blurb: "Colonial-style rooms overlooking the golf course.", hasOutlets: true },
  { id: "v-hillview-inn", name: "Hillview Inn", type: "accommodation", blurb: "Budget guesthouse in Tanah Rata.", hasOutlets: true },
  { id: "v-seven-terraces", name: "Seven Terraces", type: "accommodation", blurb: "Restored Straits-Chinese townhouses.", hasOutlets: true },
  { id: "v-kea-farm-market", name: "Kea Farm Market", type: "retail", blurb: "Roadside stalls for strawberries, honey and vegetables.", hasOutlets: true },
  { id: "v-shop-howard", name: "Shop Howard", type: "retail", blurb: "Prints, postcards and local design on Armenian Street.", hasOutlets: true },

  // Melaka — businesses that sit ON Jonker Street
  { id: "v-melaka-food-walks", name: "Melaka Heritage Food Walks", type: "activity", blurb: "Six-stop tasting walk with a Peranakan guide.", hasOutlets: false },
  { id: "v-jonker-trishaw", name: "Jonker Trishaw Association", type: "activity", blurb: "Licensed riders, decorated trishaws, fixed fares.", hasOutlets: false },
  { id: "v-jonker-88", name: "Jonker 88", type: "food", blurb: "Cendol and Nyonya laksa in a 19th-century shophouse.", hasOutlets: true },
  { id: "v-hoe-kee", name: "Hoe Kee Chicken Rice Ball", type: "food", blurb: "Melaka's rice-ball institution; expect a queue.", hasOutlets: true },
  { id: "v-wah-aik", name: "Wah Aik Shoemaker", type: "retail", blurb: "Third-generation maker of Peranakan beaded shoes.", hasOutlets: true },
  { id: "v-orangutan-house", name: "The Orangutan House", type: "retail", blurb: "Hand-printed art tees by a local painter.", hasOutlets: true },
  { id: "v-hotel-puri", name: "Hotel Puri", type: "accommodation", blurb: "Restored Peranakan mansion with a courtyard garden.", hasOutlets: true },
  { id: "v-nancys-kitchen", name: "Nancy's Kitchen", type: "food", blurb: "Family-run Nyonya cooking, off the tourist strip.", hasOutlets: true },
  // An activity vendor that is a BUSINESS, not an attraction — it belongs in the
  // nearby list with an Activity tag, which is exactly why the top/bottom split
  // cannot be drawn along category lines.
  { id: "v-melaka-river-cruise", name: "Melaka River Cruise", type: "activity", blurb: "Forty-minute boat run past the painted river houses.", hasOutlets: true },
];

// ── Outlets (only for vendors with premises) ────────────────────────────────

export const DEV_OUTLETS: DevOutlet[] = [
  // Cameron Highlands
  { id: "o-boh-tearoom", vendorId: "v-boh", name: "BOH Sungai Palas Tea Room", lat: 4.526, lng: 101.3931, city: "Brinchang" },
  { id: "o-sri-brinchang", vendorId: "v-sri-brinchang", name: "Sri Brinchang, Tanah Rata", lat: 4.4695, lng: 101.3768, city: "Tanah Rata" },
  { id: "o-steamboat-brinchang", vendorId: "v-cameron-steamboat", name: "Organic Steamboat, Brinchang", lat: 4.4966, lng: 101.3874, city: "Brinchang" },
  { id: "o-cameron-resort", vendorId: "v-cameron-resort", name: "Cameron Highlands Resort", lat: 4.4718, lng: 101.3798, city: "Tanah Rata" },
  { id: "o-hillview-inn", vendorId: "v-hillview-inn", name: "Hillview Inn, Tanah Rata", lat: 4.4708, lng: 101.3752, city: "Tanah Rata" },
  { id: "o-kea-farm", vendorId: "v-kea-farm-market", name: "Kea Farm Roadside Market", lat: 4.5093, lng: 101.3844, city: "Brinchang" },
  // No ticket-counter outlet for the Mossy Forest: a gate is part of the place,
  // not somewhere you travel to for its own sake. Contrast the BOH tea room
  // below, which IS a separate destination even though BOH also runs the estate.

  // George Town
  { id: "o-line-clear", vendorId: "v-line-clear", name: "Line Clear, Penang Road", lat: 5.4187, lng: 100.3312, city: "George Town" },
  { id: "o-chulia-hawker", vendorId: "v-chulia-hawker", name: "Chulia Street Night Market", lat: 5.4179, lng: 100.3355, city: "George Town" },
  { id: "o-seven-terraces", vendorId: "v-seven-terraces", name: "Seven Terraces, Stewart Lane", lat: 5.4184, lng: 100.3376, city: "George Town" },
  { id: "o-shop-howard", vendorId: "v-shop-howard", name: "Shop Howard, Armenian Street", lat: 5.4149, lng: 100.3384, city: "George Town" },

  // Melaka — every one of these sits ON Jonker Street or a lane off it.
  // They are outlets, not places: you go to the street, then pick a doorway.
  { id: "o-jonker-88", vendorId: "v-jonker-88", name: "Jonker 88", lat: 2.1959, lng: 102.2474, city: "Melaka City" },
  { id: "o-hoe-kee", vendorId: "v-hoe-kee", name: "Hoe Kee, Jalan Hang Jebat", lat: 2.1953, lng: 102.2465, city: "Melaka City" },
  { id: "o-wah-aik", vendorId: "v-wah-aik", name: "Wah Aik, Jalan Tokong", lat: 2.1961, lng: 102.2455, city: "Melaka City" },
  { id: "o-orangutan-house", vendorId: "v-orangutan-house", name: "Orangutan House, Lorong Hang Jebat", lat: 2.1949, lng: 102.2481, city: "Melaka City" },
  { id: "o-hotel-puri", vendorId: "v-hotel-puri", name: "Hotel Puri, Jalan Tun Tan Cheng Lock", lat: 2.1948, lng: 102.2458, city: "Melaka City" },
  { id: "o-nancys-kitchen", vendorId: "v-nancys-kitchen", name: "Nancy's Kitchen, Jalan KL Melaka", lat: 2.1877, lng: 102.253, city: "Melaka City" },
  { id: "o-river-cruise-jetty", vendorId: "v-melaka-river-cruise", name: "Muara Jetty", lat: 2.1918, lng: 102.2472, city: "Melaka City" },

  // Sabah
  { id: "o-kinabalu-hq", vendorId: "v-sabah-parks", name: "Kinabalu Park HQ", lat: 6.0044, lng: 116.5428, city: "Ranau" },
];

// ── Products ────────────────────────────────────────────────────────────────

export const DEV_PRODUCTS: DevProduct[] = [
  // Three unrelated vendors, one free mountain
  { id: "p-amin-4wd", vendorId: "v-amin-guides", name: "Rafflesia Discovery Trek + 4WD transfer", price: 120, duration: "Half day", note: "Pickup from Tanah Rata, 6 pax max" },
  { id: "p-highland-half", vendorId: "v-highland-trekkers", name: "Rafflesia & Mossy Forest half-day", price: 180, duration: "5 hours", note: "Includes Mossy Forest ticket" },
  { id: "p-asli-basic", vendorId: "v-orang-asli-collective", name: "Rafflesia hike, community guide", price: 80, duration: "4 hours", note: "Meet at Kampung Raja; no transfer" },

  // George Town
  { id: "p-gt-streetart-walk", vendorId: "v-gt-walks", name: "Street Art & Clan Jetty walking tour", price: 65, duration: "2.5 hours" },

  // Monkey Beach — three different things sold at one place
  { id: "p-boat-monkey", vendorId: "v-teluk-bahang-boats", name: "Monkey Beach boat transfer (return)", price: 40, duration: "15 min each way" },
  { id: "p-nature-guided-trek", vendorId: "v-penang-nature-guides", name: "Guided Monkey Beach trek", price: 95, duration: "5 hours", note: "Naturalist guide, includes meromictic lake stop" },

  // Managed places
  { id: "p-mossy-ticket", vendorId: "v-pahang-forestry", name: "Mossy Forest boardwalk entry", price: 10, duration: "45 min" },
  { id: "p-boh-tour", vendorId: "v-boh", name: "Tea factory guided tour", price: 0, duration: "30 min", note: "Free, first-come" },

  // Jonker Street — services sold for the street itself, not for any one shop
  { id: "p-jonker-food-walk", vendorId: "v-melaka-food-walks", name: "Jonker Street six-stop food walk", price: 75, duration: "3 hours", note: "Fri–Sun evenings, max 8 pax" },
  { id: "p-jonker-trishaw", vendorId: "v-jonker-trishaw", name: "Decorated trishaw loop", price: 40, duration: "30 min", note: "Fixed fare, up to 2 passengers" },

  // Single-operator mountain
  { id: "p-kinabalu-2d1n", vendorId: "v-sabah-parks", name: "Kinabalu 2D1N climb permit + guide + Laban Rata", price: 1250, duration: "2 days", note: "Permit quota 135/day" },
  { id: "p-kinabalu-via-ferrata", vendorId: "v-sabah-parks", name: "Via Ferrata add-on", price: 380, duration: "3 hours", note: "Requires the 2D1N package" },
];

// ── The strong link: which product is sold AT which place ───────────────────

export const DEV_PRODUCT_PLACES: DevProductPlace[] = [
  { productId: "p-amin-4wd", placeId: "brinchang-rafflesia-trail", relation: "guide_service" },
  { productId: "p-highland-half", placeId: "brinchang-rafflesia-trail", relation: "guide_service" },
  { productId: "p-asli-basic", placeId: "brinchang-rafflesia-trail", relation: "guide_service" },
  // the same Highland Trekkers package also covers the ticketed Mossy Forest
  { productId: "p-highland-half", placeId: "mossy-forest", relation: "admission" },
  { productId: "p-mossy-ticket", placeId: "mossy-forest", relation: "admission" },
  { productId: "p-boh-tour", placeId: "boh-sungai-palas", relation: "guide_service" },
  { productId: "p-gt-streetart-walk", placeId: "armenian-street-art", relation: "guide_service" },
  { productId: "p-boat-monkey", placeId: "monkey-beach-trail", relation: "addon" },
  { productId: "p-nature-guided-trek", placeId: "monkey-beach-trail", relation: "guide_service" },
  { productId: "p-jonker-food-walk", placeId: "jonker-street", relation: "guide_service" },
  { productId: "p-jonker-trishaw", placeId: "jonker-street", relation: "addon" },
  { productId: "p-kinabalu-2d1n", placeId: "kinabalu-summit-trail", relation: "admission" },
  { productId: "p-kinabalu-via-ferrata", placeId: "kinabalu-summit-trail", relation: "addon" },
  // teluk-cempedak deliberately has NO products — the "nobody sells anything" case
];

// ── Lookups ─────────────────────────────────────────────────────────────────

export function getPlace(id: string): DevPlace | undefined {
  return DEV_PLACES.find((place) => place.id === id);
}

export function getChildren(parentId: string): DevPlace[] {
  return DEV_PLACES.filter((place) => place.parentId === parentId);
}

export function getStates(): DevPlace[] {
  return DEV_PLACES.filter((place) => place.level === "state");
}

/** Root-first breadcrumb: [Pahang, Cameron Highlands, Rafflesia Trail]. */
export function getAncestors(id: string): DevPlace[] {
  const chain: DevPlace[] = [];
  let current = getPlace(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? getPlace(current.parentId) : undefined;
  }
  return chain;
}

export function getVendor(id: string): DevVendor | undefined {
  return DEV_VENDORS.find((vendor) => vendor.id === id);
}

/** Products explicitly linked to this place, newest relation first. */
export function getPlaceProducts(placeId: string): { product: DevProduct; vendor: DevVendor; relation: PlaceRelation }[] {
  return DEV_PRODUCT_PLACES.filter((link) => link.placeId === placeId)
    .map((link) => {
      const product = DEV_PRODUCTS.find((p) => p.id === link.productId);
      const vendor = product ? getVendor(product.vendorId) : undefined;
      return product && vendor ? { product, vendor, relation: link.relation } : null;
    })
    .filter((entry): entry is { product: DevProduct; vendor: DevVendor; relation: PlaceRelation } => entry !== null)
    .sort((a, b) => a.product.price - b.product.price);
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * The weak link: whatever happens to be near, by distance. No foreign key,
 * no maintenance — and it crosses district boundaries, which a parent/child
 * lookup cannot do.
 *
 * Deliberately NOT filtered by operator. A place's operator often runs a real
 * business at that place too — BOH runs the tea estate (a place) and the tea
 * room (an outlet you go to for its own sake). Excluding operators would drop
 * the tea room. The duplication problem is a data-quality one instead: a gate
 * or ticket counter is part of the place and must never be entered as an outlet.
 */
export function getNearbyOutlets(
  origin: { lat: number; lng: number },
  radiusKm = 8,
): { outlet: DevOutlet; vendor: DevVendor; km: number }[] {
  return DEV_OUTLETS.map((outlet) => ({
    outlet,
    vendor: getVendor(outlet.vendorId)!,
    km: distanceKm(origin, outlet),
  }))
    .filter((entry) => entry.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

export const RELATION_LABEL: Record<PlaceRelation, string> = {
  admission: "Includes entry",
  guide_service: "Guide service · entry is free",
  addon: "Add-on service",
};

export const VENDOR_TYPE_LABEL: Record<VendorType, string> = {
  food: "Food",
  activity: "Activity",
  accommodation: "Stay",
  retail: "Retail",
};
