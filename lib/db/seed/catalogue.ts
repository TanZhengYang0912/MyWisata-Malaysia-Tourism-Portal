// Owner: Member 2 / catalogue side (Vendor/Outlet/Product)
import type { Activity, BookingSlot, Outlet, Voucher } from "@/lib/types";

export const OUTLETS: Outlet[] = [
  { id: "o1", vendorId: "v1", name: "Penang Heritage Tours", category: "Food & Dining", state: "Penang", city: "George Town", address: "12 Lebuh Chulia, George Town, Penang", lat: 5.4141, lng: 100.3288, hours: "9:00 AM – 9:00 PM", verified: true, open: true, rating: 4.8, reviews: 234 },
  { id: "o2", vendorId: "v1", name: "Langkawi Island Adventures", category: "Island & Beach", state: "Kedah", city: "Langkawi", address: "Jetty Point, Kuah, Langkawi", lat: 6.35, lng: 99.8, hours: "8:00 AM – 6:00 PM", verified: true, open: true, rating: 4.9, reviews: 412 },
  { id: "o3", vendorId: "v2", name: "Melaka Heritage Walks", category: "Heritage & Culture", state: "Melaka", city: "Melaka City", address: "Dutch Square, Melaka City", lat: 2.1896, lng: 102.2501, hours: "9:00 AM – 6:00 PM", verified: true, open: true, rating: 4.6, reviews: 178 },
  { id: "o4", vendorId: "v2", name: "KL Craft Market Co", category: "Shopping & Retail", state: "Kuala Lumpur", city: "Kuala Lumpur", address: "Central Market, Kuala Lumpur", lat: 3.139, lng: 101.6869, hours: "10:00 AM – 10:00 PM", verified: true, open: true, rating: 4.5, reviews: 501 },
  { id: "o5", vendorId: "v2", name: "Kinabalu Nature Guides", category: "Nature & Hiking", state: "Sabah", city: "Kota Kinabalu", address: "Jalan Kinabalu, Kota Kinabalu, Sabah", lat: 5.9804, lng: 116.0735, hours: "7:00 AM – 5:00 PM", verified: true, open: false, rating: 4.9, reviews: 89 },
  { id: "o6", vendorId: "v2", name: "Cameron Highlands Tea Estate", category: "Nature & Leisure", state: "Pahang", city: "Cameron Highlands", address: "BOH Tea Estate, Cameron Highlands, Pahang", lat: 4.4696, lng: 101.3818, hours: "9:00 AM – 5:00 PM", verified: false, open: true, rating: 4.7, reviews: 143 },
];

const IMG = {
  penangFood: "https://images.unsplash.com/photo-1747493397738-56bfe5aa1d7b?w=800&h=560&fit=crop&auto=format",
  langkawi: "https://images.unsplash.com/photo-1570533459920-076b827c7b69?w=800&h=560&fit=crop&auto=format",
  melaka: "https://images.unsplash.com/photo-1600316217446-94fb90887956?w=800&h=560&fit=crop&auto=format",
  kinabalu: "https://images.unsplash.com/photo-1669812848176-593dcd49f308?w=800&h=560&fit=crop&auto=format",
  klMarket: "https://images.unsplash.com/photo-1470217957101-da7150b9b681?w=800&h=560&fit=crop&auto=format",
  cameron: "https://images.unsplash.com/photo-1651608100799-6fcf6af041ec?w=800&h=560&fit=crop&auto=format",
};

const ADULT_CHILD = [
  { id: "adult", label: "Adult", priceDelta: 0 },
  { id: "child", label: "Child", priceDelta: -15 },
];
const STANDARD = [{ id: "standard", label: "Standard", priceDelta: 0 }];

export const ACTIVITIES: Activity[] = [
  { id: "a1", outletId: "o1", name: "Penang Street Food Trail", category: "Food & Dining", description: "An immersive evening walk through George Town's legendary hawker lanes. Taste char kway teow, Penang laksa, cendol and apom balik from 6 iconic stalls guided by a local food historian.", image: IMG.penangFood, price: 68, rating: 4.8, reviews: 234, duration: "3 hrs", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Matches your food interest", hot: true },
  { id: "a2", outletId: "o2", name: "Langkawi Island Hopping", category: "Island & Beach", description: "Cruise between Pulau Dayang Bunting, Pulau Beras Basah and Eagle Square. Includes snorkelling gear, freshwater lake stop and a seafood lunch on board.", image: IMG.langkawi, price: 120, rating: 4.9, reviews: 412, duration: "Full day", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Popular with couples" },
  { id: "a3", outletId: "o3", name: "Melaka Heritage Walk", category: "Heritage & Culture", description: "Walk the Dutch Square, A Famosa, Baba Nyonya Museum and Jonker Street with a certified cultural guide. Small group max 8 pax.", image: IMG.melaka, price: 45, rating: 4.6, reviews: 178, duration: "2.5 hrs", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Cultural experience near your route" },
  { id: "a4", outletId: "o5", name: "Kinabalu Nature Day Trip", category: "Nature & Hiking", description: "Guided trekking through the lower trails of Mount Kinabalu National Park with stops at highland flora zones and a traditional Kadazan-Dusun village lunch.", image: IMG.kinabalu, price: 180, rating: 4.9, reviews: 89, duration: "Full day", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Matches your outdoor preference" },
  { id: "a5", outletId: "o4", name: "KL Craft Market Entry", category: "Shopping & Retail", description: "Curated weekend market with 60+ local artisans selling batik, pewterwork, pottery, handwoven textiles, indigenous crafts and locally roasted coffees.", image: IMG.klMarket, price: 20, rating: 4.5, reviews: 501, duration: "2 hrs", requiresBooking: false, variants: STANDARD, aiTag: "Trending in Kuala Lumpur", hot: true },
  { id: "a6", outletId: "o6", name: "Pahang Highlands Tea Walk", category: "Nature & Leisure", description: "Guided walk through BOH Tea Estate at 1,600m elevation. Tour the processing factory, pick tea leaves, and enjoy a tasting session at the cliffside café.", image: IMG.cameron, price: 55, rating: 4.7, reviews: 143, duration: "3 hrs", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Cool weather escape" },
  { id: "a7", outletId: "o1", name: "Heritage Cooking Class", category: "Food & Dining", description: "Hands-on Peranakan cooking class covering three signature Penang dishes, with a shared meal and recipe booklet to take home.", image: IMG.penangFood, price: 95, rating: 4.7, reviews: 61, duration: "2.5 hrs", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Matches your food interest" },
  { id: "a8", outletId: "o2", name: "Langkawi Sunset Cruise", category: "Island & Beach", description: "Catamaran sunset cruise along Langkawi's west coast with BBQ dinner, live music and dolphin-watching if lucky.", image: IMG.langkawi, price: 150, rating: 4.8, reviews: 97, duration: "3 hrs", requiresBooking: true, variants: ADULT_CHILD, aiTag: "Popular with couples" },
  { id: "a9", outletId: "o3", name: "Melaka River Cruise Ticket", category: "Heritage & Culture", description: "45-minute river cruise past murals, old warehouses and riverside cafés, departing every 30 minutes.", image: IMG.melaka, price: 35, rating: 4.4, reviews: 220, duration: "45 min", requiresBooking: false, variants: STANDARD },
  { id: "a10", outletId: "o4", name: "KL Batik Souvenir Set", category: "Shopping & Retail", description: "Hand-painted batik scarf and coaster gift set from a local KL artisan collective.", image: IMG.klMarket, price: 40, rating: 4.6, reviews: 58, duration: "—", requiresBooking: false, variants: STANDARD },
  { id: "a11", outletId: "o1", name: "Batik Painting Workshop", category: "Wellness & Spa", description: "Relaxing 90-minute batik painting session using traditional wax-resist technique; take your artwork home.", image: IMG.penangFood, price: 60, rating: 4.5, reviews: 34, duration: "1.5 hrs", requiresBooking: false, variants: STANDARD },
  { id: "a12", outletId: "o2", name: "Langkawi Cable Car Pass", category: "Nature & Hiking", description: "Return cable car pass to SkyBridge with panoramic views over the Andaman Sea and rainforest canopy.", image: IMG.langkawi, price: 55, rating: 4.7, reviews: 305, duration: "1.5 hrs", requiresBooking: false, variants: STANDARD, aiTag: "Near you" },
];

const BOOKING_ACTIVITY_IDS = ["a1", "a2", "a3", "a4", "a6", "a7", "a8"];

export const BOOKING_SLOTS: BookingSlot[] = BOOKING_ACTIVITY_IDS.flatMap((activityId, i) => [
  { id: `sl-${activityId}-1`, activityId, startsAt: `2026-07-1${(i % 9) + 1}T09:00:00`, capacity: 12, booked: 4 },
  { id: `sl-${activityId}-2`, activityId, startsAt: `2026-07-1${(i % 9) + 1}T14:00:00`, capacity: 12, booked: 12 }, // full slot demo case
]);

export const VOUCHERS: Voucher[] = [
  { id: "v1", code: "WELCOME10", type: "percent", value: 10, minSpend: 0, usageCap: 100, usageCount: 5, expiresAt: "2026-12-31" },
  { id: "v2", code: "EXPIRED5", type: "fixed", value: 5, minSpend: 0, usageCap: 50, usageCount: 10, expiresAt: "2026-01-01" },
  { id: "v3", code: "BIG50", type: "fixed", value: 50, minSpend: 300, usageCap: 20, usageCount: 2, expiresAt: "2026-12-31" },
  { id: "v4", code: "MAXED20", type: "percent", value: 20, minSpend: 0, usageCap: 3, usageCount: 3, expiresAt: "2026-12-31" },
];
