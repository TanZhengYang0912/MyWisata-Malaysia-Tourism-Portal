import type { DemoPlace, DemoState, RouteSummary, TravelMode } from "./types";

export const KL_LOCATION = { lat: 3.139, lng: 101.6869 } as const;

export const DEMO_STATES: DemoState[] = [
  { id: "perlis", name: "Perlis", kind: "state", region: "Peninsular", label: [100.25, 6.55] },
  { id: "kedah", name: "Kedah", kind: "state", region: "Peninsular", label: [100.47, 5.95] },
  { id: "penang", name: "Penang", kind: "state", region: "Peninsular", label: [100.33, 5.42] },
  { id: "perak", name: "Perak", kind: "state", region: "Peninsular", label: [101.02, 4.72] },
  { id: "selangor", name: "Selangor", kind: "state", region: "Peninsular", label: [101.48, 3.2] },
  { id: "kuala-lumpur", name: "Kuala Lumpur", kind: "federal-territory", region: "Peninsular", label: [101.69, 3.14] },
  { id: "putrajaya", name: "Putrajaya", kind: "federal-territory", region: "Peninsular", label: [101.7, 2.93] },
  { id: "negeri-sembilan", name: "Negeri Sembilan", kind: "state", region: "Peninsular", label: [102.1, 2.7] },
  { id: "melaka", name: "Melaka", kind: "state", region: "Peninsular", label: [102.25, 2.2] },
  { id: "johor", name: "Johor", kind: "state", region: "Peninsular", label: [103.5, 1.9] },
  { id: "kelantan", name: "Kelantan", kind: "state", region: "Peninsular", label: [102.0, 5.4] },
  { id: "terengganu", name: "Terengganu", kind: "state", region: "Peninsular", label: [102.9, 5.1] },
  { id: "pahang", name: "Pahang", kind: "state", region: "Peninsular", label: [102.8, 3.7] },
  { id: "sarawak", name: "Sarawak", kind: "state", region: "Borneo", label: [113.3, 2.7] },
  { id: "sabah", name: "Sabah", kind: "state", region: "Borneo", label: [117.0, 5.6] },
  { id: "labuan", name: "Labuan", kind: "federal-territory", region: "Borneo", label: [115.23, 5.32] },
];

function route(distanceKm: number, drivingMinutes: number, walkingMinutes: number, bicyclingMinutes: number, transitMinutes: number): Record<TravelMode, RouteSummary> {
  return {
    driving: { durationText: `${drivingMinutes} min`, distanceText: `${distanceKm.toFixed(1)} km` },
    walking: { durationText: `${walkingMinutes} min`, distanceText: `${Math.max(0.8, distanceKm * 0.92).toFixed(1)} km` },
    bicycling: { durationText: `${bicyclingMinutes} min`, distanceText: `${Math.max(0.8, distanceKm * 1.02).toFixed(1)} km` },
    transit: { durationText: `${transitMinutes} min`, distanceText: `${Math.max(1.2, distanceKm * 1.12).toFixed(1)} km` },
  };
}

function place(input: Omit<DemoPlace, "route"> & { route: Record<TravelMode, RouteSummary> }): DemoPlace {
  return input;
}

export const DEMO_PLACES: DemoPlace[] = [
  place({ id: "kl-night-bites", name: "Jalan Alor Night Bites", type: "activity", category: "Food & Dining", stateId: "kuala-lumpur", city: "Kuala Lumpur", description: "A lively evening food trail through smoky grills, sweet desserts and local favourites.", accent: "#E79A4E", lat: 3.1457, lng: 101.7101, rating: 4.8, reviews: 286, price: 48, address: "Jalan Alor, Bukit Bintang, Kuala Lumpur", tags: ["street food", "evening", "local guide"], route: route(4.2, 12, 52, 20, 26) }),
  place({ id: "kl-art-weekend", name: "Kuala Lumpur Art Weekend", type: "recommended", category: "Heritage & Culture", stateId: "kuala-lumpur", city: "Kuala Lumpur", description: "Small galleries, public art and independent studios connected into one easy city route.", accent: "#D86F5D", lat: 3.1583, lng: 101.6964, rating: 4.7, reviews: 118, price: 35, address: "Central Market and Merdeka Square, Kuala Lumpur", tags: ["art", "walking", "city culture"], route: route(3.1, 10, 40, 16, 22) }),
  place({ id: "putrajaya-lakeside", name: "Putrajaya Lakeside Walk", type: "activity", category: "Nature & Leisure", stateId: "putrajaya", city: "Putrajaya", description: "A relaxed lakeside route linking gardens, bridges and sunset viewpoints.", accent: "#E5B64C", lat: 2.9346, lng: 101.6914, rating: 4.6, reviews: 92, price: 18, address: "Persiaran Perdana, Putrajaya", tags: ["sunset", "family", "easy walk"], route: route(5.4, 15, 68, 25, 36) }),
  place({ id: "selangor-forest", name: "Klang Gates Forest Escape", type: "recommended", category: "Nature & Hiking", stateId: "selangor", city: "Hulu Klang", description: "A green half-day escape with shaded trails and a quiet reservoir edge.", accent: "#68A87C", lat: 3.2388, lng: 101.756, rating: 4.5, reviews: 74, price: 30, address: "Hulu Klang, Selangor", tags: ["forest", "hiking", "half day"], route: route(18.7, 34, 235, 72, 76) }),
  place({ id: "ns-heritage-trail", name: "Seremban Heritage Trail", type: "activity", category: "Heritage & Culture", stateId: "negeri-sembilan", city: "Seremban", description: "A compact trail through old shop houses, food stalls and Negeri Sembilan stories.", accent: "#D86F5D", lat: 2.7258, lng: 101.9424, rating: 4.4, reviews: 51, price: 28, address: "Seremban Old Town, Negeri Sembilan", tags: ["heritage", "food", "walking"], route: route(10.6, 22, 136, 42, 54) }),
  place({ id: "melaka-river-lights", name: "Melaka River Lights", type: "activity", category: "Heritage & Culture", stateId: "melaka", city: "Melaka", description: "A twilight river route with stories of old port streets, bridges and local flavours.", accent: "#D86F5D", lat: 2.1944, lng: 102.2487, rating: 4.9, reviews: 310, price: 42, address: "Jonker Street, Melaka", tags: ["night walk", "history", "river"], route: route(14.4, 26, 182, 56, 64) }),
  place({ id: "johor-island-hop", name: "Johor Island Hopper", type: "recommended", category: "Island & Beach", stateId: "johor", city: "Mersing", description: "A bright island day with clear water, simple seafood and a slow coastal rhythm.", accent: "#5CABB0", lat: 2.4312, lng: 103.8405, rating: 4.7, reviews: 66, price: 145, address: "Mersing Jetty, Johor", tags: ["island", "sea", "day trip"], route: route(128, 130, 1560, 520, 210) }),
  place({ id: "pahang-canopy", name: "Taman Negara Canopy Walk", type: "activity", category: "Nature & Hiking", stateId: "pahang", city: "Kuala Tahan", description: "A rainforest introduction with canopy views, river air and an easy guided trail.", accent: "#68A87C", lat: 4.674, lng: 102.404, rating: 4.8, reviews: 143, price: 88, address: "Kuala Tahan, Pahang", tags: ["rainforest", "wildlife", "guided"], route: route(220, 190, 2700, 840, 290) }),
  place({ id: "terengganu-jetty", name: "Kuala Terengganu Craft Route", type: "vendor", category: "Shopping & Retail", stateId: "terengganu", city: "Kuala Terengganu", description: "A small craft route for batik, woven goods and local makers near the waterfront.", accent: "#D86F5D", lat: 5.3302, lng: 103.137, rating: 4.5, reviews: 48, price: 24, address: "Pasar Payang, Kuala Terengganu", tags: ["craft", "batik", "market"], route: route(26.8, 34, 338, 105, 82) }),
  place({ id: "kelantan-market", name: "Kota Bharu Morning Market", type: "vendor", category: "Food & Dining", stateId: "kelantan", city: "Kota Bharu", description: "A colourful morning market stop for breakfast plates, herbs and traditional snacks.", accent: "#E79A4E", lat: 6.1254, lng: 102.2381, rating: 4.6, reviews: 83, price: 20, address: "Siti Khadijah Market, Kota Bharu", tags: ["breakfast", "market", "local food"], route: route(28.4, 36, 350, 108, 88) }),
  place({ id: "kedah-paddy", name: "Kedah Paddy View", type: "recommended", category: "Nature & Leisure", stateId: "kedah", city: "Alor Setar", description: "Wide paddy views, village roads and a calm afternoon outside the city.", accent: "#E5B64C", lat: 6.1184, lng: 100.3685, rating: 4.4, reviews: 57, price: 26, address: "Alor Setar, Kedah", tags: ["paddy field", "scenic", "slow travel"], route: route(38.1, 48, 470, 145, 112) }),
  place({ id: "penang-food-lane", name: "George Town Food Lane", type: "activity", category: "Food & Dining", stateId: "penang", city: "George Town", description: "Hawker classics, clan jetties and a local host who knows the best late-night bites.", accent: "#E79A4E", lat: 5.4141, lng: 100.3288, rating: 4.8, reviews: 412, price: 48, address: "George Town, Penang", tags: ["hawker", "heritage", "night"], route: route(8.5, 18, 105, 34, 48) }),
  place({ id: "penang-hill-dawn", name: "Penang Hill Dawn", type: "recommended", category: "Nature & Hiking", stateId: "penang", city: "Air Itam", description: "An early start for forest air, hilltop views and a rewarding breakfast after the climb.", accent: "#68A87C", lat: 5.4164, lng: 100.2731, rating: 4.7, reviews: 198, price: 55, address: "Penang Hill, Air Itam", tags: ["sunrise", "hike", "viewpoint"], route: route(11.2, 27, 140, 42, 64) }),
  place({ id: "perak-cave-temple", name: "Ipoh Cave Temple Loop", type: "activity", category: "Heritage & Culture", stateId: "perak", city: "Ipoh", description: "A gentle cultural loop across limestone temples, old town coffee and mural lanes.", accent: "#D86F5D", lat: 4.5975, lng: 101.0901, rating: 4.6, reviews: 121, price: 38, address: "Ipoh, Perak", tags: ["temple", "limestone", "coffee"], route: route(48.2, 58, 600, 185, 142) }),
  place({ id: "perlis-limestone", name: "Perlis Limestone Country", type: "recommended", category: "Nature & Hiking", stateId: "perlis", city: "Kangar", description: "A small-state adventure with limestone landscapes, caves and village stops.", accent: "#68A87C", lat: 6.4375, lng: 100.1986, rating: 4.3, reviews: 39, price: 32, address: "Kangar, Perlis", tags: ["limestone", "caves", "quiet"], route: route(58.7, 71, 720, 220, 180) }),
  place({ id: "sabah-sea-village", name: "Kota Kinabalu Sea Village", type: "activity", category: "Island & Beach", stateId: "sabah", city: "Kota Kinabalu", description: "Seafood, island views and a warm evening route around the waterfront.", accent: "#5CABB0", lat: 5.9804, lng: 116.0735, rating: 4.8, reviews: 174, price: 62, address: "Kota Kinabalu Waterfront, Sabah", tags: ["seafood", "island view", "sunset"], route: route(12.2, 21, 150, 48, 58) }),
  place({ id: "sabah-kinabalu", name: "Kinabalu Foothills", type: "recommended", category: "Nature & Hiking", stateId: "sabah", city: "Ranau", description: "Cooler air, mountain silhouettes and a local farm trail in the foothills.", accent: "#68A87C", lat: 6.0101, lng: 116.7812, rating: 4.9, reviews: 229, price: 110, address: "Ranau, Sabah", tags: ["mountain", "farm", "cool air"], route: route(92.4, 126, 1120, 350, 170) }),
  place({ id: "labuan-wreck", name: "Labuan Wreck & Coast", type: "activity", category: "Island & Beach", stateId: "labuan", city: "Labuan", description: "A relaxed island day built around clear water, coastal history and seafood.", accent: "#5CABB0", lat: 5.2831, lng: 115.2308, rating: 4.5, reviews: 42, price: 95, address: "Victoria, Labuan", tags: ["coast", "history", "seafood"], route: route(6.8, 15, 83, 28, 42) }),
  place({ id: "sarawak-river", name: "Kuching River Stories", type: "activity", category: "Heritage & Culture", stateId: "sarawak", city: "Kuching", description: "A riverside story route through old streets, small museums and sunset food stalls.", accent: "#D86F5D", lat: 1.5533, lng: 110.3592, rating: 4.8, reviews: 163, price: 52, address: "Kuching Waterfront, Sarawak", tags: ["river", "museum", "sunset"], route: route(9.4, 18, 118, 37, 52) }),
  place({ id: "sarawak-longhouse", name: "Longhouse Food Table", type: "recommended", category: "Food & Dining", stateId: "sarawak", city: "Kuching", description: "An intimate introduction to Sarawak flavours hosted around a generous shared table.", accent: "#E79A4E", lat: 1.6147, lng: 110.4059, rating: 4.7, reviews: 89, price: 78, address: "Kuching, Sarawak", tags: ["food", "community", "culture"], route: route(14.3, 26, 180, 56, 72) }),
];

export const CATEGORY_OPTIONS = [
  { id: "all", label: "All places", icon: "✦" },
  { id: "Food & Dining", label: "Food", icon: "⌁" },
  { id: "Heritage & Culture", label: "Culture", icon: "◈" },
  { id: "Nature & Hiking", label: "Nature", icon: "⌂" },
  { id: "Island & Beach", label: "Coast", icon: "≈" },
  { id: "Shopping & Retail", label: "Craft", icon: "◇" },
  { id: "Nature & Leisure", label: "Leisure", icon: "○" },
] as const;

export const RADIUS_OPTIONS_KM = [25, 50, 100] as const;

export function getRouteSummary(place: DemoPlace, mode: TravelMode): RouteSummary {
  return place.route[mode];
}

export function getState(stateId: string): DemoState | undefined {
  return DEMO_STATES.find((state) => state.id === stateId);
}

export function getPlace(placeId: string): DemoPlace | undefined {
  return DEMO_PLACES.find((place) => place.id === placeId);
}
