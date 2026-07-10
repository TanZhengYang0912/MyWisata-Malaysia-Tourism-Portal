// Owner: Member 3 (Discovery/Recommendation/Growth)
import type { VendorRecommendation } from "@/lib/types";

export const VENDOR_RECOMMENDATIONS: VendorRecommendation[] = [
  { id: "r1", submittedBy: "u5", name: "Perak Waterfall Hidden Cave", category: "Hidden Gems", state: "Perak", status: "pending", qualityScore: 92, duplicate: false },
  { id: "r2", submittedBy: "u6", name: "Terengganu Kampung Homestay", category: "Accommodation", state: "Terengganu", status: "pending", qualityScore: 87, duplicate: false },
  { id: "r3", submittedBy: "u7", name: "Penang Street Food Trail", category: "Food & Dining", state: "Penang", status: "pending", qualityScore: 41, duplicate: true },
  { id: "r4", submittedBy: "u8", name: "Langkawi Sunset Cruise Deck", category: "Island & Beach", state: "Kedah", status: "pending", qualityScore: 79, duplicate: false },
];
