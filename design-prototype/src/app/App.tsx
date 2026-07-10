import { useState } from "react";
import {
  Search, MapPin, Star, Heart, Share2, MessageCircle,
  Bell, ChevronRight, Clock, CheckCircle, TrendingUp,
  Users, Package, BarChart2, Shield, AlertCircle, Settings,
  Plus, DollarSign, Calendar, X, Sparkles,
  Gem, Send, QrCode,
  MoreHorizontal, Menu, CheckSquare, XCircle,
  Activity, CreditCard, LogOut, Tag, Inbox, PieChart,
  Globe, Navigation, ChevronDown, Filter, SlidersHorizontal,
  Wallet, User, Home, Map, ArrowRight
} from "lucide-react";

// ─── Palette ───────────────────────────────────────────────────────────────
const G = "#0F5D4A";
const T = "#087E8B";
const R = "#C7363D";
const Au = "#F2B84B";
const W = "#F8FAF7";
const S = "#24313A";

// ─── Data ─────────────────────────────────────────────────────────────────
const LISTINGS = [
  {
    id: 1, name: "Penang Street Food Trail", category: "Food & Dining", state: "Penang",
    location: "George Town, Penang", price: 68, rating: 4.8, reviews: 234,
    distance: "2.1 km", duration: "3 hrs",
    img: "https://images.unsplash.com/photo-1747493397738-56bfe5aa1d7b?w=800&h=560&fit=crop&auto=format",
    aiTag: "Matches your food interest", icon: "🍜", verified: true, open: true, hot: true,
    desc: "An immersive evening walk through George Town's legendary hawker lanes. Taste char kway teow, Penang laksa, cendol and apom balik from 6 iconic stalls guided by a local food historian.",
  },
  {
    id: 2, name: "Langkawi Island Hopping", category: "Island & Beach", state: "Kedah",
    location: "Langkawi, Kedah", price: 120, rating: 4.9, reviews: 412,
    distance: "389 km", duration: "Full day",
    img: "https://images.unsplash.com/photo-1570533459920-076b827c7b69?w=800&h=560&fit=crop&auto=format",
    aiTag: "Popular with couples", icon: "🏝", verified: true, open: true, hot: false,
    desc: "Cruise between Pulau Dayang Bunting, Pulau Beras Basah and Eagle Square. Includes snorkelling gear, freshwater lake stop and a seafood lunch on board.",
  },
  {
    id: 3, name: "Melaka Heritage Walk", category: "Heritage & Culture", state: "Melaka",
    location: "Melaka City", price: 45, rating: 4.6, reviews: 178,
    distance: "148 km", duration: "2.5 hrs",
    img: "https://images.unsplash.com/photo-1600316217446-94fb90887956?w=800&h=560&fit=crop&auto=format",
    aiTag: "Cultural experience near your route", icon: "🏛", verified: true, open: true, hot: false,
    desc: "Walk the Dutch Square, A Famosa, Baba Nyonya Museum and Jonker Street with a certified cultural guide. Small group max 8 pax.",
  },
  {
    id: 4, name: "Kinabalu Nature Day Trip", category: "Nature & Hiking", state: "Sabah",
    location: "Kota Kinabalu, Sabah", price: 180, rating: 4.9, reviews: 89,
    distance: "1,541 km", duration: "Full day",
    img: "https://images.unsplash.com/photo-1669812848176-593dcd49f308?w=800&h=560&fit=crop&auto=format",
    aiTag: "Matches your outdoor preference", icon: "🌿", verified: true, open: false, hot: false,
    desc: "Guided trekking through the lower trails of Mount Kinabalu National Park with stops at highland flora zones and a traditional Kadazan-Dusun village lunch.",
  },
  {
    id: 5, name: "KL Craft Market", category: "Shopping & Retail", state: "Kuala Lumpur",
    location: "Kuala Lumpur", price: 20, rating: 4.5, reviews: 501,
    distance: "0.8 km", duration: "2 hrs",
    img: "https://images.unsplash.com/photo-1470217957101-da7150b9b681?w=800&h=560&fit=crop&auto=format",
    aiTag: "Trending in Kuala Lumpur", icon: "🛍", verified: true, open: true, hot: true,
    desc: "Curated weekend market with 60+ local artisans selling batik, pewterwork, pottery, handwoven textiles, indigenous crafts and locally roasted coffees.",
  },
  {
    id: 6, name: "Pahang Highlands Tea Walk", category: "Nature & Leisure", state: "Pahang",
    location: "Cameron Highlands, Pahang", price: 55, rating: 4.7, reviews: 143,
    distance: "203 km", duration: "3 hrs",
    img: "https://images.unsplash.com/photo-1651608100799-6fcf6af041ec?w=800&h=560&fit=crop&auto=format",
    aiTag: "Cool weather escape", icon: "🍵", verified: false, open: true, hot: false,
    desc: "Guided walk through BOH Tea Estate at 1,600m elevation. Tour the processing factory, pick tea leaves, and enjoy a tasting session at the cliffside café.",
  },
  {
    id: 7, name: "Sarawak Cultural Village", category: "Heritage & Culture", state: "Sarawak",
    location: "Kuching, Sarawak", price: 95, rating: 4.8, reviews: 211,
    distance: "1,490 km", duration: "Half day",
    img: "https://images.unsplash.com/photo-1742391355474-e765ee5f510e?w=800&h=560&fit=crop&auto=format",
    aiTag: "Hidden gem", icon: "🎭", verified: true, open: true, hot: false,
    desc: "Step inside longhouses, watch traditional dance performances and craft demonstrations from Iban, Bidayuh, Orang Ulu and Malay communities.",
  },
  {
    id: 8, name: "Putrajaya Lake Cruise", category: "City Experience", state: "Putrajaya",
    location: "Putrajaya", price: 50, rating: 4.5, reviews: 302,
    distance: "25 km", duration: "1.5 hrs",
    img: "https://images.unsplash.com/photo-1709754954361-c36e86f75fa1?w=800&h=560&fit=crop&auto=format",
    aiTag: "Near you", icon: "🛥", verified: true, open: true, hot: false,
    desc: "Sunset cruise across the 650-hectare man-made lake, passing the iconic pink mosque, government palace and wetland bird sanctuary.",
  },
];

const CATEGORIES = [
  { id: "food", label: "Food & Dining", icon: "🍜", count: 142 },
  { id: "beach", label: "Island & Beach", icon: "🏝", count: 68 },
  { id: "heritage", label: "Heritage & Culture", icon: "🏛", count: 93 },
  { id: "nature", label: "Nature & Hiking", icon: "🌿", count: 117 },
  { id: "family", label: "Family Activities", icon: "👨‍👩‍👧", count: 54 },
  { id: "shopping", label: "Shopping & Retail", icon: "🛍", count: 79 },
  { id: "wellness", label: "Wellness & Spa", icon: "🧘", count: 38 },
  { id: "gems", label: "Hidden Gems", icon: "💎", count: 61 },
];

const STATES_MY = [
  "All Malaysia", "Kuala Lumpur", "Penang", "Melaka", "Johor",
  "Sabah", "Sarawak", "Langkawi", "Pahang", "Perak", "Selangor", "Terengganu",
];

// ─── Atoms ────────────────────────────────────────────────────────────────
function AiTag({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ backgroundColor: Au, color: S, fontFamily: "'IBM Plex Mono', monospace" }}>
      <Sparkles size={9} /> {text}
    </span>
  );
}

function JourneyRibbon({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => (
        <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
          <div className="flex items-center w-full">
            <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: i === 0 ? G : i < steps.length - 1 ? T : Au, backgroundColor: "white" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === 0 ? G : i < steps.length - 1 ? T : Au }} />
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px border-t-2 border-dashed" style={{ borderColor: T + "50" }} />
            )}
          </div>
          <span className="text-[9px] mt-1 text-center px-0.5 leading-tight" style={{ color: "#5E7268" }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Listing Card ─────────────────────────────────────────────────────────
function ListingCard({ listing, onTap }: { listing: (typeof LISTINGS)[0]; onTap: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div onClick={onTap}
      className="rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:-translate-y-1"
      style={{ backgroundColor: "white", boxShadow: "0 2px 16px rgba(36,49,58,0.08)" }}>
      <div className="relative overflow-hidden" style={{ height: 200 }}>
        <img src={listing.img} alt={listing.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundColor: "#C8D8D0" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.5) 0%, transparent 55%)" }} />
        {listing.hot && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: R }}>🔥 Trending</div>
        )}
        <button onClick={e => { e.stopPropagation(); setSaved(v => !v); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all"
          style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
          <Heart size={14} fill={saved ? R : "none"} stroke={saved ? R : "#555"} />
        </button>
        {listing.verified && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: G }}>
            <CheckCircle size={9} /> Verified
          </div>
        )}
        {!listing.open && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: "rgba(36,49,58,0.8)" }}>Closed</div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-bold text-sm leading-snug line-clamp-2" style={{ color: S, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {listing.name}
        </h3>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#5E7268" }}>
          <MapPin size={11} /> {listing.location}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <Star size={11} fill={Au} stroke="none" />
            <span className="font-semibold" style={{ color: S }}>{listing.rating}</span>
            <span style={{ color: "#5E7268" }}>({listing.reviews})</span>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: "#5E7268" }}>
            <Clock size={10} /> {listing.duration}
          </div>
        </div>
        <AiTag text={listing.aiTag} />
        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="text-lg font-bold" style={{ color: G, fontFamily: "'IBM Plex Mono', monospace" }}>RM {listing.price}</span>
            <span className="text-xs ml-1" style={{ color: "#5E7268" }}>/ person</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); }}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:opacity-90"
            style={{ backgroundColor: G }}>
            Book Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Listing Modal ────────────────────────────────────────────────────────
function ListingModal({ listing, onClose }: { listing: (typeof LISTINGS)[0]; onClose: () => void }) {
  const [booked, setBooked] = useState(false);
  const [saved, setSaved] = useState(false);

  if (booked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: "rgba(36,49,58,0.7)", backdropFilter: "blur(4px)" }}>
        <div className="rounded-3xl p-8 max-w-md w-full flex flex-col items-center text-center"
          style={{ backgroundColor: "white", boxShadow: "0 40px 80px rgba(36,49,58,0.25)" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: G + "15" }}>
            <CheckCircle size={44} color={G} />
          </div>
          <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Fraunces', serif", color: S }}>Booking Confirmed!</h2>
          <p className="text-sm mb-6" style={{ color: "#5E7268" }}>Your adventure is locked in.</p>
          <div className="w-full rounded-2xl p-4 mb-4 space-y-3 text-left" style={{ backgroundColor: W }}>
            <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: "rgba(15,93,74,0.1)" }}>
              <img src={listing.img} alt="" className="w-14 h-14 rounded-xl object-cover" style={{ backgroundColor: "#C8D8D0" }} />
              <div>
                <p className="font-bold text-sm" style={{ color: S }}>{listing.name}</p>
                <p className="text-xs" style={{ color: "#5E7268" }}>{listing.location}</p>
              </div>
            </div>
            {[["Booking ID", "#MY-2024-8812"], ["Date", "15 Jul 2024 · 9:00 AM"], ["Total Paid", `RM ${listing.price}`]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span style={{ color: "#5E7268" }}>{k}</span>
                <span className="font-bold" style={{ color: k === "Total Paid" ? G : S, fontFamily: k === "Total Paid" || k === "Booking ID" ? "'IBM Plex Mono', monospace" : "inherit" }}>{v}</span>
              </div>
            ))}
            <div className="flex justify-center pt-2">
              <div className="w-28 h-28 rounded-xl flex items-center justify-center" style={{ backgroundColor: G + "10" }}>
                <QrCode size={64} color={G} />
              </div>
            </div>
          </div>
          <div className="w-full rounded-xl p-3 mb-5 flex items-center gap-2" style={{ backgroundColor: Au + "20" }}>
            <Sparkles size={14} color={Au} />
            <p className="text-xs font-semibold" style={{ color: S }}>You earned <span style={{ color: G }}>+RM 6.80</span> in affiliate rewards!</p>
          </div>
          <button onClick={onClose} className="w-full py-3.5 rounded-full font-bold text-white" style={{ backgroundColor: G }}>
            Back to Explore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: "rgba(36,49,58,0.65)", backdropFilter: "blur(4px)" }}>
      <div className="rounded-3xl overflow-hidden max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "white", boxShadow: "0 40px 80px rgba(36,49,58,0.25)" }}>
        <div className="relative" style={{ height: 320 }}>
          <img src={listing.img} alt={listing.name} className="w-full h-full object-cover" style={{ backgroundColor: "#C8D8D0" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.7) 0%, transparent 50%)" }} />
          <button onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
            <X size={16} color={S} />
          </button>
          {listing.verified && (
            <div className="absolute bottom-4 left-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: G }}>
              <CheckCircle size={13} /> Verified Vendor
            </div>
          )}
          <button onClick={() => setSaved(v => !v)}
            className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.9)" }}>
            <Heart size={16} fill={saved ? R : "none"} stroke={saved ? R : S} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold leading-tight mb-2" style={{ fontFamily: "'Fraunces', serif", color: S }}>{listing.name}</h2>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm" style={{ color: "#5E7268" }}>
                  <MapPin size={13} /> {listing.location}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Star size={13} fill={Au} stroke="none" />
                  <span className="font-bold" style={{ color: S }}>{listing.rating}</span>
                  <span style={{ color: "#5E7268" }}>({listing.reviews} reviews)</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm" style={{ color: listing.open ? G : "#aaa" }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: listing.open ? G : "#aaa" }} />
                  {listing.open ? "Open Now" : "Currently Closed"}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold" style={{ color: G, fontFamily: "'IBM Plex Mono', monospace" }}>RM {listing.price}</p>
              <p className="text-xs" style={{ color: "#5E7268" }}>per person</p>
            </div>
          </div>

          <AiTag text={listing.aiTag} />

          <p className="text-sm leading-relaxed" style={{ color: "#4A5E56" }}>{listing.desc}</p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Duration", value: listing.duration, icon: <Clock size={15} /> },
              { label: "Group Size", value: "2–12 pax", icon: <Users size={15} /> },
              { label: "Language", value: "EN / BM", icon: <Globe size={15} /> },
            ].map(d => (
              <div key={d.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: W }}>
                <div className="flex justify-center mb-1" style={{ color: T }}>{d.icon}</div>
                <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "#5E7268" }}>{d.label}</p>
                <p className="text-sm font-bold" style={{ color: S }}>{d.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: G + "0D" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: G }}>Booking Journey</p>
            <JourneyRibbon steps={["Select Date", "Choose Package", "Add to Cart", "Payment", "Confirmed"]} />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setBooked(true)}
              className="flex-1 py-4 rounded-full font-bold text-white flex items-center justify-center gap-2 text-base transition-all hover:opacity-90"
              style={{ backgroundColor: G }}>
              <Calendar size={16} /> Book Now
            </button>
            <button className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all hover:bg-green-50"
              style={{ borderColor: G, color: G }}>
              <MessageCircle size={18} />
            </button>
            <button className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all hover:bg-green-50"
              style={{ borderColor: G, color: G }}>
              <Navigation size={18} />
            </button>
            <button className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all hover:bg-green-50"
              style={{ borderColor: G, color: G }}>
              <Share2 size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tourist Website ──────────────────────────────────────────────────────
function TouristWebsite() {
  const [selState, setSelState] = useState("All Malaysia");
  const [selCat, setSelCat] = useState<string | null>(null);
  const [selListing, setSelListing] = useState<(typeof LISTINGS)[0] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const filtered = LISTINGS.filter(l =>
    (selState === "All Malaysia" || l.state === selState) &&
    (!selCat || l.category.toLowerCase().includes(selCat.replace(/_/g, " ")))
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: W, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {selListing && <ListingModal listing={selListing} onClose={() => setSelListing(null)} />}

      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b" style={{ backgroundColor: "rgba(248,250,247,0.95)", borderColor: "rgba(15,93,74,0.1)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-8 h-16">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: G }}>
              <Globe size={16} className="text-white" />
            </div>
            <span className="font-bold text-base" style={{ color: S, fontFamily: "'Fraunces', serif" }}>MyWisata</span>
          </div>

          <div className="hidden md:flex items-center gap-6 flex-1">
            {["Explore", "Destinations", "Activities", "Hidden Gems", "Deals"].map(n => (
              <button key={n} className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: n === "Explore" ? G : "#5E7268" }}>{n}</button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3 ml-auto shrink-0">
            <button className="text-sm font-semibold transition-opacity hover:opacity-70" style={{ color: "#5E7268" }}>Sign In</button>
            <button className="px-4 py-2 rounded-full text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: G }}>
              Get Started
            </button>
          </div>
          <button className="md:hidden ml-auto" onClick={() => setMobileNav(v => !v)}>
            <Menu size={20} color={S} />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: 560 }}>
        <img
          src="https://images.unsplash.com/photo-1742391355474-e765ee5f510e?w=1600&h=700&fit=crop&auto=format"
          alt="Malaysia tourism"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ backgroundColor: "#C8D8D0" }}
        />
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${S}E0 0%, ${G}99 40%, ${T}55 100%)` }} />

        <div className="relative max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5"
              style={{ backgroundColor: "rgba(242,184,75,0.2)", color: Au, border: `1px solid ${Au}50` }}>
              <Sparkles size={11} /> AI-Personalised Discovery · 16 Malaysian States
            </div>
            <h1 className="text-5xl font-bold text-white leading-tight mb-4"
              style={{ fontFamily: "'Fraunces', serif" }}>
              Discover Malaysia<br />Like a Local
            </h1>
            <p className="text-lg text-white/80 mb-8 leading-relaxed">
              From rainforest hikes in Sabah to street food trails in Penang — find, book and share authentic Malaysian experiences with confidence.
            </p>

            {/* Hero search */}
            <div className="flex gap-2 p-2 rounded-2xl max-w-xl" style={{ backgroundColor: "rgba(255,255,255,0.97)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search size={16} color="#5E7268" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
                  placeholder="Search experiences, places or vendors…"
                  style={{ color: S }}
                />
              </div>
              <div className="w-px self-stretch" style={{ backgroundColor: "rgba(15,93,74,0.15)" }} />
              <div className="flex items-center gap-1 px-3">
                <MapPin size={14} color={T} />
                <select className="text-sm font-semibold bg-transparent outline-none cursor-pointer" style={{ color: S }}>
                  {STATES_MY.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: G }}>
                Search
              </button>
            </div>
          </div>

          {/* Hero stats */}
          <div className="flex gap-8 mt-10">
            {[["2,400+", "Experiences"], ["16", "States Covered"], ["RM 20–500", "All Budgets"], ["50k+", "Happy Travellers"]].map(([v, l]) => (
              <div key={l}>
                <p className="text-xl font-bold text-white" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{v}</p>
                <p className="text-xs text-white/60">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* State selector */}
      <section className="border-b sticky top-16 z-30" style={{ backgroundColor: "rgba(248,250,247,0.97)", borderColor: "rgba(15,93,74,0.08)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-3 hide-scrollbar">
            {STATES_MY.map(st => (
              <button key={st} onClick={() => setSelState(st)}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap"
                style={{
                  borderColor: selState === st ? G : "transparent",
                  backgroundColor: selState === st ? G : "transparent",
                  color: selState === st ? "white" : "#5E7268",
                }}>
                {st}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Fraunces', serif", color: S }}>Browse by Category</h2>
            <p className="text-sm mt-1" style={{ color: "#5E7268" }}>What kind of experience are you looking for?</p>
          </div>
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setSelCat(selCat === cat.id ? null : cat.id)}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: selCat === cat.id ? G + "12" : "white",
                border: `2px solid ${selCat === cat.id ? G : "transparent"}`,
                boxShadow: "0 1px 8px rgba(36,49,58,0.06)",
              }}>
              <span className="text-2xl">{cat.icon}</span>
              <p className="text-[10px] font-bold text-center leading-tight" style={{ color: selCat === cat.id ? G : S }}>{cat.label}</p>
              <p className="text-[9px]" style={{ color: "#5E7268" }}>{cat.count} places</p>
            </button>
          ))}
        </div>
      </section>

      {/* AI Picks */}
      <section className="py-10" style={{ backgroundColor: G + "08" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} color={Au} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: Au }}>AI-Personalised</span>
              </div>
              <h2 className="text-2xl font-bold" style={{ fontFamily: "'Fraunces', serif", color: S }}>Picked For You</h2>
              <p className="text-sm mt-0.5" style={{ color: "#5E7268" }}>Based on your interests, location and travel style</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: "rgba(15,93,74,0.2)", color: "#5E7268" }}>
                <SlidersHorizontal size={12} /> Filters
              </button>
              <button className="flex items-center gap-1 text-sm font-semibold" style={{ color: G }}>
                View all <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {(filtered.length > 0 ? filtered : LISTINGS).slice(0, 4).map(l => (
              <ListingCard key={l.id} listing={l} onTap={() => setSelListing(l)} />
            ))}
          </div>
        </div>
      </section>

      {/* Destinations banner */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Fraunces', serif", color: S }}>Top Destinations</h2>
          <button className="flex items-center gap-1 text-sm font-semibold" style={{ color: G }}>
            All destinations <ChevronRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { name: "Penang", sub: "142 experiences", img: "https://images.unsplash.com/photo-1598790132269-22e51b916318?w=600&h=400&fit=crop&auto=format", wide: true },
            { name: "Sabah", sub: "98 experiences", img: "https://images.unsplash.com/photo-1669812848176-593dcd49f308?w=600&h=400&fit=crop&auto=format", wide: false },
            { name: "Melaka", sub: "76 experiences", img: "https://images.unsplash.com/photo-1600316217446-94fb90887956?w=600&h=400&fit=crop&auto=format", wide: false },
          ].map((d, i) => (
            <div key={d.name} className={`relative rounded-2xl overflow-hidden cursor-pointer group ${i === 0 ? "row-span-2" : ""}`}
              style={{ height: i === 0 ? "auto" : 180, minHeight: i === 0 ? 370 : "auto" }}>
              <img src={d.img} alt={d.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundColor: "#C8D8D0" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.75) 0%, transparent 50%)" }} />
              <div className="absolute bottom-0 left-0 p-5">
                <p className="text-xl font-bold text-white" style={{ fontFamily: "'Fraunces', serif" }}>{d.name}</p>
                <p className="text-xs text-white/70">{d.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* All Listings grid */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: "'Fraunces', serif", color: S }}>
              {selState === "All Malaysia" ? "All Experiences" : `Experiences in ${selState}`}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "#5E7268" }}>{(filtered.length > 0 ? filtered : LISTINGS).length} results</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="text-xs font-semibold px-3 py-2 rounded-lg border outline-none" style={{ borderColor: "rgba(15,93,74,0.15)", color: "#5E7268" }}>
              <option>Sort: Recommended</option>
              <option>Price: Low to High</option>
              <option>Highest Rated</option>
              <option>Nearest First</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {(filtered.length > 0 ? filtered : LISTINGS).map(l => (
            <ListingCard key={l.id} listing={l} onTap={() => setSelListing(l)} />
          ))}
        </div>
      </section>

      {/* Affiliate CTA strip */}
      <section className="py-12" style={{ backgroundColor: S }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} color={Au} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: Au }}>Earn While You Share</span>
            </div>
            <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Fraunces', serif" }}>Turn Your Recommendations Into Rewards</h2>
            <p className="text-sm text-white/60 mt-1">Share listings with your affiliate link. Earn commission on every booking — tracked in your wallet.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button className="px-6 py-3 rounded-full font-bold text-sm text-white" style={{ backgroundColor: G }}>
              Get Verified & Earn
            </button>
            <button className="px-6 py-3 rounded-full font-bold text-sm border text-white" style={{ borderColor: "rgba(255,255,255,0.25)" }}>
              How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10" style={{ borderColor: "rgba(15,93,74,0.1)" }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row gap-8 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: G }}>
                <Globe size={13} className="text-white" />
              </div>
              <span className="font-bold" style={{ color: S, fontFamily: "'Fraunces', serif" }}>MyWisata</span>
            </div>
            <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#5E7268" }}>
              Malaysia's trusted tourism discovery and commerce platform. Connecting travellers, vendors and communities across 16 states.
            </p>
          </div>
          {[
            { heading: "Explore", links: ["Browse by State", "Categories", "Hidden Gems", "Deals & Vouchers"] },
            { heading: "For Vendors", links: ["Register Business", "Vendor Dashboard", "Analytics", "Support"] },
            { heading: "Platform", links: ["How It Works", "Affiliate Program", "Wallet & Rewards", "Trust & Safety"] },
          ].map(col => (
            <div key={col.heading}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: S }}>{col.heading}</p>
              <ul className="space-y-2">
                {col.links.map(l => (
                  <li key={l}>
                    <a href="#" className="text-xs transition-colors hover:opacity-70" style={{ color: "#5E7268" }}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-8 mt-8 border-t flex items-center justify-between"
          style={{ borderColor: "rgba(15,93,74,0.08)" }}>
          <p className="text-xs" style={{ color: "#5E7268" }}>© 2024 MyWisata Sdn Bhd. All rights reserved.</p>
          <p className="text-xs" style={{ color: "#5E7268" }}>🇲🇾 Made in Malaysia</p>
        </div>
      </footer>

      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}

// ─── Vendor Dashboard ─────────────────────────────────────────────────────
const VENDOR_METRICS = [
  { label: "Revenue (July)", value: "RM 12,480", change: "+18%", icon: <DollarSign size={18} />, color: G },
  { label: "Bookings", value: "147", change: "+23%", icon: <Calendar size={18} />, color: T },
  { label: "Active Listings", value: "8", change: "Stable", icon: <Package size={18} />, color: Au },
  { label: "Unread Chats", value: "5", change: "New", icon: <MessageCircle size={18} />, color: R },
];

const VENDOR_LISTINGS = [
  { name: "Penang Street Food Trail", status: "Active", bookings: 42, stock: "Unlimited", price: "RM 68" },
  { name: "Heritage Cooking Class", status: "Active", bookings: 28, stock: "12 slots left", price: "RM 95" },
  { name: "Sunset Cruise Package", status: "Draft", bookings: 0, stock: "20 slots", price: "RM 150" },
  { name: "Weekend Market Stall", status: "Active", bookings: 77, stock: "Unlimited", price: "RM 20" },
  { name: "Batu Caves Morning Walk", status: "Paused", bookings: 14, stock: "8 slots left", price: "RM 55" },
];

type VendorTab = "dashboard" | "listings" | "bookings" | "analytics" | "vouchers" | "chat";

function VendorDashboard() {
  const [vTab, setVTab] = useState<VendorTab>("dashboard");

  const sideNav: { id: VendorTab; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <BarChart2 size={16} />, label: "Dashboard" },
    { id: "listings", icon: <Package size={16} />, label: "Listings" },
    { id: "bookings", icon: <Calendar size={16} />, label: "Bookings" },
    { id: "analytics", icon: <TrendingUp size={16} />, label: "Analytics" },
    { id: "vouchers", icon: <Tag size={16} />, label: "Vouchers" },
    { id: "chat", icon: <Inbox size={16} />, label: "Chat Inbox" },
  ];

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex flex-col w-60 shrink-0" style={{ backgroundColor: S }}>
        <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: "rgba(248,250,247,0.08)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: G }}>
            <Globe size={16} className="text-white" />
          </div>
          <span className="font-bold text-white" style={{ fontFamily: "'Fraunces', serif" }}>MyWisata</span>
        </div>
        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(248,250,247,0.08)" }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Vendor Account</p>
          <p className="text-sm font-bold text-white">Penang Heritage Tours</p>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: Au + "25", color: Au }}>
            <CheckCircle size={9} /> Verified
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {sideNav.map(n => (
            <button key={n.id} onClick={() => setVTab(n.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ backgroundColor: vTab === n.id ? G : "transparent", color: vTab === n.id ? "white" : "rgba(255,255,255,0.45)" }}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "rgba(248,250,247,0.08)" }}>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            <Settings size={15} /> Settings
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            <LogOut size={15} /> Log Out
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: W }}>
        <div className="flex items-center justify-between px-8 py-4 border-b bg-white shrink-0" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
          <div>
            <h1 className="font-bold text-lg" style={{ color: S }}>
              {vTab === "dashboard" ? "Dashboard Overview" : vTab === "listings" ? "Product Catalogue" : vTab === "bookings" ? "Bookings & Orders" : vTab === "analytics" ? "Analytics" : vTab === "vouchers" ? "Vouchers & Promotions" : "Chat Inbox"}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#5E7268" }}>Welcome back, Ahmad — here's your summary for today</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: G }}>
              <Plus size={13} /> Add Listing
            </button>
            <div className="relative">
              <Bell size={18} color={S} />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[7px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: R }}>5</span>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ backgroundColor: G }}>A</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="grid grid-cols-4 gap-5">
            {VENDOR_METRICS.map(m => (
              <div key={m.label} className="rounded-2xl p-5" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: m.color + "18", color: m.color }}>
                    {m.icon}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: G + "12", color: G }}>{m.change}</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: S, fontFamily: "'IBM Plex Mono', monospace" }}>{m.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "#5E7268" }}>{m.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
            <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
              <h2 className="font-bold" style={{ color: S }}>Your Listings</h2>
              <button className="text-xs font-semibold" style={{ color: G }}>Manage all →</button>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: "#F4F8F6" }}>
                  {["Listing Name", "Status", "Bookings", "Availability", "Price", "Actions"].map(h => (
                    <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "#5E7268" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VENDOR_LISTINGS.map((l, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: "rgba(15,93,74,0.06)" }}>
                    <td className="px-6 py-4 font-semibold text-sm" style={{ color: S }}>{l.name}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: l.status === "Active" ? G + "15" : l.status === "Draft" ? Au + "25" : R + "12",
                          color: l.status === "Active" ? G : l.status === "Draft" ? "#B08020" : R,
                        }}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold" style={{ color: S, fontFamily: "'IBM Plex Mono', monospace" }}>{l.bookings}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: "#5E7268" }}>{l.stock}</td>
                    <td className="px-6 py-4 text-sm font-bold" style={{ color: G, fontFamily: "'IBM Plex Mono', monospace" }}>{l.price}</td>
                    <td className="px-6 py-4">
                      <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#EEF2F0" }}>
                        <MoreHorizontal size={14} color={S} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="rounded-2xl p-5" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
              <h3 className="font-bold mb-4" style={{ color: S }}>Today&apos;s Bookings</h3>
              <div className="space-y-3">
                {[
                  { name: "Nurul Ain", listing: "Street Food Trail", time: "9:00 AM", paid: true },
                  { name: "Raj Kumar", listing: "Street Food Trail", time: "2:00 PM", paid: true },
                  { name: "Li Wei", listing: "Heritage Cooking", time: "11:00 AM", paid: false },
                  { name: "Sarah M.", listing: "Sunset Cruise", time: "5:30 PM", paid: true },
                ].map((b, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0" style={{ borderColor: "rgba(15,93,74,0.07)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: G }}>{b.name[0]}</div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: S }}>{b.name}</p>
                        <p className="text-xs" style={{ color: "#5E7268" }}>{b.listing} · {b.time}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: b.paid ? G + "15" : Au + "25", color: b.paid ? G : "#B08020" }}>
                      {b.paid ? "Paid" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl p-5" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
              <h3 className="font-bold mb-4" style={{ color: S }}>Chat Inbox</h3>
              <div className="space-y-3">
                {[
                  { name: "Siti Rahmah", msg: "Is the tour halal-certified food only?", time: "10m", unread: true },
                  { name: "James Tan", msg: "Can we join with kids under 5?", time: "1h", unread: true },
                  { name: "Priya S.", msg: "Thank you! Wonderful experience.", time: "3h", unread: false },
                  { name: "Ahmad F.", msg: "What's included in the RM 68 price?", time: "5h", unread: false },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "rgba(15,93,74,0.07)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: T }}>
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: S }}>{c.name}</p>
                      <p className="text-xs truncate" style={{ color: "#5E7268" }}>{c.msg}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs" style={{ color: "#5E7268" }}>{c.time}</span>
                      {c.unread && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: G }} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────
function AdminDashboard() {
  const [aTab, setATab] = useState("overview");
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  const aiReplies: Record<string, string> = {
    "withdrawal": "3 pending withdrawals above RM 500. Highest: RM 1,200 from user @nurul_ain88 — KYC verified, flagged for dual approval. 1 withdrawal on hold (fraud review).",
    "kyc": "12 KYC submissions pending. 2 documents appear low-resolution — recommend requesting re-upload. Average review time today: 4.2 min.",
    "ticket": "Support tickets up 18% this week. Top category: 'Voucher not applying at checkout' (34%). Suggest updating the checkout FAQ.",
    "fraud": "2 active fraud flags: duplicate recommendation from same IP, and unusual click spike on affiliate link #AFF-0041.",
  };

  const handleAsk = () => {
    const key = Object.keys(aiReplies).find(k => aiQuery.toLowerCase().includes(k));
    setAiAnswer(key ? aiReplies[key] : "No specific data found for that query. Try: 'withdrawal', 'kyc', 'ticket' or 'fraud'.");
  };

  const sideNav = [
    { id: "overview", icon: <Activity size={15} />, label: "Overview" },
    { id: "vendors", icon: <Package size={15} />, label: "Vendor Approvals" },
    { id: "kyc", icon: <Shield size={15} />, label: "KYC Review" },
    { id: "withdrawals", icon: <DollarSign size={15} />, label: "Withdrawals" },
    { id: "recommendations", icon: <Gem size={15} />, label: "Recommendations" },
    { id: "support", icon: <Inbox size={15} />, label: "Support Tickets" },
    { id: "analytics", icon: <PieChart size={15} />, label: "Analytics" },
    { id: "users", icon: <Users size={15} />, label: "User Management" },
  ];

  const pendingVendors = [
    { name: "Sarawak River Cruises Sdn Bhd", state: "Sarawak", cat: "Adventure & Outdoor", submitted: "9 Jul 2024", docs: true },
    { name: "KL Wellness & Spa Studio", state: "Kuala Lumpur", cat: "Wellness & Spa", submitted: "8 Jul 2024", docs: true },
    { name: "Kelantan Batik Atelier", state: "Kelantan", cat: "Shopping & Retail", submitted: "7 Jul 2024", docs: false },
    { name: "Ipoh Perak Heritage Trail Co.", state: "Perak", cat: "Heritage & Culture", submitted: "6 Jul 2024", docs: true },
  ];

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex flex-col w-60 shrink-0" style={{ backgroundColor: "#1A272F" }}>
        <div className="flex items-center gap-2.5 px-5 py-5 border-b" style={{ borderColor: "rgba(248,250,247,0.07)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: R }}>
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-sm" style={{ fontFamily: "'Fraunces', serif" }}>MyWisata</span>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Admin Panel</p>
          </div>
        </div>
        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(248,250,247,0.07)" }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Signed in as</p>
          <p className="text-sm font-bold text-white">Farah Nabilah</p>
          <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ backgroundColor: R + "25", color: R }}>
            <Shield size={9} /> Super Admin
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {sideNav.map(n => (
            <button key={n.id} onClick={() => setATab(n.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ backgroundColor: aTab === n.id ? R : "transparent", color: aTab === n.id ? "white" : "rgba(255,255,255,0.45)" }}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: "rgba(248,250,247,0.07)" }}>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            <Settings size={15} /> Settings
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: W }}>
        {/* AI topbar */}
        <div className="flex items-center gap-3 px-8 py-4 border-b bg-white shrink-0" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: Au + "25" }}>
            <Sparkles size={14} color={Au} />
          </div>
          <input
            className="flex-1 text-sm bg-transparent outline-none"
            placeholder='Ask AI assistant: "Show pending withdrawals above RM 500", "Summarise KYC queue", "Flag fraud patterns"'
            style={{ color: S }}
            value={aiQuery}
            onChange={e => setAiQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAsk()}
          />
          <button onClick={handleAsk}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: S }}>
            <Send size={11} /> Ask AI
          </button>
          <div className="relative shrink-0">
            <Bell size={18} color={S} />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[7px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: R }}>9</span>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0" style={{ backgroundColor: R }}>F</div>
        </div>

        {aiAnswer && (
          <div className="mx-8 mt-4 rounded-xl p-3.5 flex items-start gap-2.5" style={{ backgroundColor: Au + "1A", border: `1px solid ${Au}40` }}>
            <Sparkles size={14} color={Au} className="shrink-0 mt-0.5" />
            <p className="text-sm flex-1" style={{ color: S }}>{aiAnswer}</p>
            <button onClick={() => setAiAnswer("")} className="shrink-0"><X size={13} color="#5E7268" /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-5">
            {[
              { label: "Vendor Approvals Pending", value: "7", color: G, icon: <Package size={18} />, urgent: true },
              { label: "KYC Submissions Pending", value: "12", color: T, icon: <Shield size={18} />, urgent: false },
              { label: "Withdrawals to Review", value: "4", color: Au, icon: <DollarSign size={18} />, urgent: false },
              { label: "Fraud Flags Active", value: "2", color: R, icon: <AlertCircle size={18} />, urgent: true },
            ].map(m => (
              <div key={m.label} className="rounded-2xl p-5 relative overflow-hidden"
                style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
                {m.urgent && <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: R }} />}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: m.color + "18", color: m.color }}>{m.icon}</div>
                <p className="text-3xl font-bold" style={{ color: S, fontFamily: "'IBM Plex Mono', monospace" }}>{m.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "#5E7268" }}>{m.label}</p>
              </div>
            ))}
          </div>

          {/* Vendor approval queue */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
            <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: G }}>{pendingVendors.length}</div>
              <h2 className="font-bold" style={{ color: S }}>Vendor Approval Queue</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "rgba(15,93,74,0.06)" }}>
              {pendingVendors.map((v, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0" style={{ backgroundColor: G }}>
                    {v.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: S }}>{v.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#5E7268" }}>{v.cat} · {v.state} · Submitted {v.submitted}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: v.docs ? G + "15" : Au + "25", color: v.docs ? G : "#B08020" }}>
                    {v.docs ? "Docs Complete" : "Missing Docs"}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <button className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5" style={{ backgroundColor: G }}>
                      <CheckSquare size={12} /> Approve
                    </button>
                    <button className="px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5" style={{ borderColor: R, color: R }}>
                      <XCircle size={12} /> Reject
                    </button>
                    <button className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: "rgba(15,93,74,0.2)", color: "#5E7268" }}>
                      Review Docs
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Withdrawals */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
              <div className="px-6 py-5 border-b" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
                <h2 className="font-bold" style={{ color: S }}>Withdrawal Approvals</h2>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(15,93,74,0.06)" }}>
                {[
                  { user: "Amirah K.", amount: "RM 68.80", method: "Maybank", kyc: true, high: false },
                  { user: "Hafiz M.", amount: "RM 580.00", method: "Touch 'n Go", kyc: true, high: true },
                  { user: "Priya S.", amount: "RM 125.00", method: "FPX / CIMB", kyc: true, high: false },
                  { user: "John L.", amount: "RM 35.00", method: "GrabPay", kyc: false, high: false },
                ].map((w, i) => (
                  <div key={i} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: T }}>
                      {w.user[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold" style={{ color: S }}>{w.user}</p>
                        {w.high && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: Au + "25", color: "#B08020" }}>Dual Approval</span>}
                        {!w.kyc && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: R + "15", color: R }}>KYC Fail</span>}
                      </div>
                      <p className="text-xs" style={{ color: "#5E7268" }}>{w.method}</p>
                    </div>
                    <p className="font-bold shrink-0" style={{ color: S, fontFamily: "'IBM Plex Mono', monospace" }}>{w.amount}</p>
                    <div className="flex gap-1.5 shrink-0">
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: G + "15", color: G }}><CheckSquare size={12} /></button>
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: R + "15", color: R }}><X size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "white", boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
              <div className="px-6 py-5 border-b" style={{ borderColor: "rgba(15,93,74,0.08)" }}>
                <h2 className="font-bold" style={{ color: S }}>Recommendation Submissions</h2>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(15,93,74,0.06)" }}>
                {[
                  { place: "Perak Waterfall Hidden Cave", cat: "Hidden Gems", by: "Ahmad R.", dupe: false, score: 92 },
                  { place: "Terengganu Kampung Homestay", cat: "Accommodation", by: "Lina Y.", dupe: false, score: 87 },
                  { place: "Penang Street Food Trail", cat: "Food & Dining", by: "Zack T.", dupe: true, score: 41 },
                  { place: "Langkawi Sunset Cruise", cat: "Island & Beach", by: "Meera P.", dupe: false, score: 79 },
                ].map((r, i) => (
                  <div key={i} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold" style={{ color: S }}>{r.place}</p>
                        {r.dupe && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: R + "15", color: R }}>Duplicate</span>}
                      </div>
                      <p className="text-xs" style={{ color: "#5E7268" }}>{r.cat} · by {r.by}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#EEF2F0" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.score}%`, backgroundColor: r.score > 70 ? G : r.score > 50 ? Au : R }} />
                      </div>
                      <span className="text-xs font-bold" style={{ color: r.score > 70 ? G : r.score > 50 ? Au : R, fontFamily: "'IBM Plex Mono', monospace" }}>{r.score}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: G + "15", color: G }}><CheckSquare size={12} /></button>
                      <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: R + "15", color: R }}><X size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────
type Role = "tourist" | "vendor" | "admin";

export default function App() {
  const [role, setRole] = useState<Role>("tourist");

  const roles: { id: Role; label: string; emoji: string }[] = [
    { id: "tourist", label: "Tourist Website", emoji: "🧳" },
    { id: "vendor", label: "Vendor Dashboard", emoji: "🏪" },
    { id: "admin", label: "Admin Panel", emoji: "🛡" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Role switcher */}
      <div className="flex items-center justify-between px-6 py-2.5 shrink-0 z-50" style={{ backgroundColor: S }}>
        <span className="text-white/40 text-xs">Malaysia Tourism Platform — Switch View:</span>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.07)" }}>
          {roles.map(r => (
            <button key={r.id} onClick={() => setRole(r.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ backgroundColor: role === r.id ? "white" : "transparent", color: role === r.id ? S : "rgba(255,255,255,0.45)" }}>
              {r.emoji} {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {role === "tourist" && <TouristWebsite />}
        {role === "vendor" && <VendorDashboard />}
        {role === "admin" && <AdminDashboard />}
      </div>
    </div>
  );
}
