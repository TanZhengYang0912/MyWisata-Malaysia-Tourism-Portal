import {
  Clock, Tag, Phone, Gauge, Ruler, TrendingUp, Timer, Trees, UserCheck, Backpack, CalendarRange, MapPinned,
  Ticket, Languages, Shirt, Landmark, ShieldCheck, Flame, Users, Waves, CalendarCheck, PackageCheck, Music,
  Baby, Sun, CreditCard, BadgeCheck, BedDouble, Wifi, FileText, MapPin, Sprout, Ban, CalendarClock, ChefHat,
  Utensils, Wine, Armchair, Layers, PawPrint, Accessibility, DollarSign, Building2, Car, Sparkles, Heart,
} from "lucide-react";
import type { ComputedActivity } from "@/backend/core/types";

export type DetailChip = { label: string; value: string; icon: typeof Clock; href?: string };

type FieldType = "text" | "number" | "select" | "boolean" | "list";

interface AttrField {
  // "_"-prefixed keys resolve from existing outlet/tag/product data (see
  // resolveValue below); anything else reads products.attributes[key].
  key: string;
  label: string;
  icon: typeof Clock;
  type: FieldType;
  unit?: string;
  options?: string[];
}

// The second taxonomy level within a category (e.g. Food -> Chinese/Malay/...).
// Matches products.type_slugs. Purely descriptive metadata here — filtering on
// it is a later pass (see plan §4 deferred).
export interface TypeOption {
  slug: string;
  label: string;
}

interface CategoryDetail {
  types: TypeOption[];
  fields: AttrField[];
}

// Reused across every category so listings don't lose today's baseline info.
const HOURS: AttrField = { key: "_hours", label: "Hours", icon: Clock, type: "text" };
const TAGS: AttrField = { key: "_tags", label: "Tags", icon: Tag, type: "list" };
const CONTACT: AttrField = { key: "_contact", label: "Contact", icon: Phone, type: "text" };

// The 4 top-level categories (categories.slug). Each carries its own `type`
// vocabulary (products.type_slugs) plus the full attribute catalogue for that
// category — see docs plan "Phase 1 taxonomy foundation" for the source list.
export const CATEGORY_DETAILS: Record<string, CategoryDetail> = {
  food: {
    types: [
      { slug: "chinese", label: "Chinese" },
      { slug: "malay", label: "Malay" },
      { slug: "nyonya", label: "Nyonya / Peranakan" },
      { slug: "indian", label: "Indian" },
      { slug: "mamak", label: "Mamak / Street" },
      { slug: "western", label: "Western" },
      { slug: "seafood", label: "Seafood" },
      { slug: "cafe-dessert", label: "Café / Dessert" },
      { slug: "fusion", label: "Fusion" },
    ],
    fields: [
      HOURS,
      { key: "halalCertified", label: "Halal Certified", icon: BadgeCheck, type: "boolean" },
      { key: "vegetarianOptions", label: "Vegetarian Options", icon: Sprout, type: "boolean" },
      { key: "veganOptions", label: "Vegan Options", icon: Sprout, type: "boolean" },
      { key: "porkFree", label: "Pork-Free", icon: Ban, type: "boolean" },
      { key: "mealPeriods", label: "Meal Periods", icon: CalendarClock, type: "list" },
      { key: "serviceType", label: "Service", icon: Utensils, type: "list" },
      { key: "signatureDishes", label: "Signature Dishes", icon: ChefHat, type: "list" },
      { key: "menuHighlights", label: "Menu Highlights", icon: Utensils, type: "list" },
      { key: "spiceLevel", label: "Spice Level", icon: Flame, type: "text" },
      { key: "alcoholServed", label: "Alcohol Served", icon: Wine, type: "boolean" },
      { key: "seatingCapacity", label: "Seating Capacity", icon: Armchair, type: "number" },
      { key: "reservationNeeded", label: "Reservation Needed", icon: CalendarCheck, type: "boolean" },
      TAGS,
      CONTACT,
    ],
  },
  activity: {
    types: [
      { slug: "nature", label: "Nature" },
      { slug: "adventure", label: "Adventure" },
      { slug: "cultural", label: "Cultural / Heritage" },
      { slug: "nightlife", label: "Nightlife" },
      { slug: "wellness", label: "Wellness / Spa" },
      { slug: "water", label: "Water" },
      { slug: "sightseeing", label: "Sightseeing / Tours" },
    ],
    fields: [
      { key: "difficulty", label: "Difficulty", icon: Gauge, type: "select", options: ["Easy", "Moderate", "Hard", "Expert"] },
      { key: "durationEstimate", label: "Duration", icon: Timer, type: "text" },
      { key: "sessionLength", label: "Session Length", icon: Timer, type: "text" },
      { key: "distanceKm", label: "Trail Distance", icon: Ruler, type: "number", unit: "km" },
      { key: "elevationGainM", label: "Elevation Gain", icon: TrendingUp, type: "number", unit: "m" },
      { key: "terrain", label: "Terrain", icon: Trees, type: "text" },
      { key: "indoorOutdoor", label: "Indoor / Outdoor", icon: Sun, type: "select", options: ["Indoor", "Outdoor", "Both"] },
      { key: "facilities", label: "Facilities", icon: PackageCheck, type: "list" },
      { key: "minAge", label: "Minimum Age", icon: UserCheck, type: "number", unit: "yrs" },
      { key: "ageRange", label: "Age Range", icon: Baby, type: "text" },
      { key: "ageLimit", label: "Age Limit", icon: UserCheck, type: "number", unit: "+" },
      { key: "fitnessLevel", label: "Fitness Level", icon: Flame, type: "text" },
      { key: "groupSize", label: "Group Size", icon: Users, type: "text" },
      { key: "guideIncluded", label: "Guide Included", icon: UserCheck, type: "boolean" },
      { key: "guideLanguage", label: "Guide / Language", icon: Languages, type: "text" },
      { key: "equipmentProvided", label: "Equipment Provided", icon: Backpack, type: "boolean" },
      { key: "whatToBring", label: "What to Bring", icon: Backpack, type: "list" },
      { key: "meetingPoint", label: "Meeting Point", icon: MapPinned, type: "text" },
      { key: "bestSeason", label: "Best Season", icon: CalendarRange, type: "text" },
      { key: "bestTimeToVisit", label: "Best Time to Visit", icon: CalendarRange, type: "text" },
      { key: "safetyNote", label: "Safety / Insurance", icon: ShieldCheck, type: "text" },
      { key: "entryFee", label: "Entry Ticket", icon: Ticket, type: "text" },
      { key: "coverCharge", label: "Entry / Cover", icon: Ticket, type: "text" },
      { key: "dressCode", label: "Dress Code", icon: Shirt, type: "text" },
      { key: "historicalEra", label: "Historical Era", icon: Landmark, type: "text" },
      { key: "musicGenre", label: "Music Genre", icon: Music, type: "text" },
      { key: "reservation", label: "Reservation", icon: CalendarCheck, type: "boolean" },
      { key: "byAppointment", label: "By Appointment", icon: CalendarCheck, type: "boolean" },
      { key: "servicesOffered", label: "Services Offered", icon: Waves, type: "list" },
      { key: "amenities", label: "Amenities", icon: PackageCheck, type: "list" },
      { key: "included", label: "What's Included", icon: PackageCheck, type: "list" },
      { key: "genderPolicy", label: "Gender", icon: Users, type: "select", options: ["Unisex", "Female-only", "Male-only"] },
      HOURS,
      TAGS,
      CONTACT,
    ],
  },
  accommodation: {
    types: [
      { slug: "5-star", label: "5-Star" },
      { slug: "4-star", label: "4-Star" },
      { slug: "3-star", label: "3-Star" },
      { slug: "boutique", label: "Boutique" },
      { slug: "homestay", label: "Homestay" },
      { slug: "hostel", label: "Hostel" },
      { slug: "resort", label: "Resort" },
    ],
    fields: [
      { key: "roomTypes", label: "Room Types", icon: BedDouble, type: "list" },
      { key: "numberOfRooms", label: "Number of Rooms", icon: Layers, type: "number" },
      { key: "maxGuests", label: "Max Guests", icon: Users, type: "number", unit: "guests" },
      { key: "checkInOut", label: "Check-in / Check-out", icon: Clock, type: "text" },
      { key: "amenities", label: "Amenities", icon: Wifi, type: "list" },
      { key: "pricePerNight", label: "Price per Night", icon: DollarSign, type: "number", unit: "RM" },
      { key: "cancellationPolicy", label: "Cancellation Policy", icon: FileText, type: "text" },
      { key: "petFriendly", label: "Pet Friendly", icon: PawPrint, type: "boolean" },
      { key: "wheelchairAccessible", label: "Wheelchair Accessible", icon: Accessibility, type: "boolean" },
      { key: "nearbyLandmarks", label: "Nearby Landmarks", icon: MapPinned, type: "list" },
      CONTACT,
    ],
  },
  retail: {
    types: [
      { slug: "handicrafts", label: "Handicrafts" },
      { slug: "souvenirs", label: "Souvenirs" },
      { slug: "batik-textiles", label: "Batik / Textiles" },
      { slug: "fashion", label: "Fashion" },
      { slug: "jewellery", label: "Jewellery" },
      { slug: "local-produce", label: "Local Produce / Food" },
      { slug: "art-prints", label: "Art & Prints" },
      { slug: "shopping-mall", label: "Shopping Mall / Complex" },
      { slug: "market-bazaar", label: "Market / Bazaar / Night Market" },
      { slug: "duty-free", label: "Duty-Free" },
    ],
    fields: [
      HOURS,
      { key: "productCategories", label: "Product Categories", icon: Tag, type: "list" },
      { key: "signatureProducts", label: "Signature Products", icon: Sparkles, type: "list" },
      { key: "paymentMethods", label: "Payment Methods", icon: CreditCard, type: "list" },
      { key: "certification", label: "Certification", icon: BadgeCheck, type: "text" },
      { key: "madeLocally", label: "Made Locally / Artisan", icon: Heart, type: "boolean" },
      { key: "customisationAvailable", label: "Customisation Available", icon: Sparkles, type: "boolean" },
      { key: "shippingAvailable", label: "Shipping / Delivery", icon: Car, type: "boolean" },
      { key: "priceBand", label: "Price Band", icon: DollarSign, type: "select", options: ["$", "$$", "$$$"] },
      { key: "numberOfStores", label: "Number of Stores", icon: Building2, type: "number" },
      { key: "anchorTenants", label: "Anchor Tenants", icon: Building2, type: "list" },
      { key: "parking", label: "Parking", icon: Car, type: "boolean" },
      { key: "directoryFloors", label: "Floors", icon: Layers, type: "number" },
      CONTACT,
    ],
  },
};

const GENERIC_DETAIL: CategoryDetail = { types: [], fields: [HOURS, TAGS, CONTACT] };

function resolveValue(field: AttrField, activity: ComputedActivity): string | null {
  switch (field.key) {
    case "_hours":
      return activity.outlet.hours || null;
    case "_tags":
      return activity.tags && activity.tags.length > 0 ? activity.tags.join(" · ") : null;
    case "_contact":
      return activity.outlet.phone ?? null;
    default: {
      const raw = activity.attributes?.[field.key];
      if (raw === null || raw === undefined || raw === "") return null;
      if (Array.isArray(raw)) return raw.length > 0 ? raw.join(" · ") : null;
      if (typeof raw === "boolean") return raw ? "Yes" : "No";
      return field.unit ? `${raw} ${field.unit}` : String(raw);
    }
  }
}

// Renders one chip per configured field that has a value; missing/empty
// attributes are skipped rather than shown blank. Address, Type(s) and
// cross-cutting badges (family/couple friendly — Hidden Gem already has its
// own hero badge, so it's not repeated here) are universal, prepended ahead
// of the category's own fields.
export function getCategoryChips(activity: ComputedActivity): DetailChip[] {
  const detail = CATEGORY_DETAILS[activity.categorySlug ?? ""] ?? GENERIC_DETAIL;
  const chips: DetailChip[] = [];

  if (activity.outlet.address) {
    chips.push({ label: "Address", value: activity.outlet.address, icon: MapPin });
  }
  if (activity.typeSlugs && activity.typeSlugs.length > 0) {
    const labels = activity.typeSlugs.map((slug) => detail.types.find((t) => t.slug === slug)?.label ?? slug);
    chips.push({ label: "Type", value: labels.join(" · "), icon: Tag });
  }
  const badgeLabels = [activity.isFamilyFriendly && "Family Friendly", activity.isCoupleFriendly && "Couple Friendly"].filter(Boolean) as string[];
  if (badgeLabels.length > 0) {
    chips.push({ label: "Good For", value: badgeLabels.join(" · "), icon: Heart });
  }

  for (const field of detail.fields) {
    const value = resolveValue(field, activity);
    if (value === null) continue;
    chips.push({
      label: field.label,
      value,
      icon: field.icon,
      href: field.key === "_contact" ? `tel:${value}` : undefined,
    });
  }
  return chips;
}
