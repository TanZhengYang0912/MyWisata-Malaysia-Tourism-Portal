"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Building2,
  CalendarDays,
  CarFront,
  Compass,
  MapPin,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ComputedActivity } from "@/backend/core/types";
import { searchActivities } from "@/backend/domains/catalogue";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { destinationHref, MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { DestinationPreviewModal } from "@/components/customer/destination-preview-modal";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { useTranslation } from "react-i18next";
import { ATLAS_BRAND_NAME, ATLAS_PRODUCT_NAME, BRAND_NAME } from "@/lib/i18n/invariant-tokens";

const DESTINATIONS_PER_PAGE = 6;
const DESTINATION_RAIL_SIZE = 4;

const PLACEHOLDER_TEXTS = [
  "Where should we wander?",
  "Try 'Penang street food'...",
  "Try 'Mount Kinabalu hike'...",
  "Try 'Langkawi island hopping'...",
  "Try 'Melaka heritage trail'...",
  "Try 'Borneo rainforest'..."
];

function useTypewriterPlaceholder(texts: string[], typingSpeed = 70, deletingSpeed = 40, pauseDelay = 2000) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const currentText = texts[index];

    if (isDeleting) {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(currentText.substring(0, text.length - 1)), deletingSpeed);
      } else {
        timeout = setTimeout(() => { setIsDeleting(false); setIndex((i) => (i + 1) % texts.length); }, 0);
      }
    } else {
      if (text.length < currentText.length) {
        timeout = setTimeout(() => setText(currentText.substring(0, text.length + 1)), typingSpeed);
      } else {
        timeout = setTimeout(() => setIsDeleting(true), pauseDelay);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, isDeleting, index, texts, typingSpeed, deletingSpeed, pauseDelay]);

  return text || " ";
}

type CityGuide = {
  label: string;
  eyebrow: string;
  description: string;
  detail: string;
  icon: typeof Route;
};

const CITY_GUIDES: CityGuide[] = [
  {
    label: "City guide",
    eyebrow: "Start with the essentials",
    description: "See the city through a local partner, with a clear first stop and room to follow your curiosity.",
    detail: "A vendor can match you with the right outlet before you choose an experience.",
    icon: Route,
  },
  {
    label: "Transport & transfers",
    eyebrow: "Door to door, your pace",
    description: "Keep the day moving with a local transfer partner and a route that fits your pace.",
    detail: "Compare published partner packages and confirm availability before checkout.",
    icon: CarFront,
  },
  {
    label: "Weekend escape",
    eyebrow: "Leave room to linger",
    description: "Build a short break around one region, then pick the vendor and outlet that make the route work.",
    detail: "See the local partners serving your chosen destination before you commit.",
    icon: CalendarDays,
  },
  {
    label: "Local host",
    eyebrow: "Meet the storykeepers",
    description: "Choose the people behind the place first, then find their outlets, activities and local favourites.",
    detail: "Start at the vendor profile, where outlet-specific details stay clear.",
    icon: UsersRound,
  },
];

type DemoVendor = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  businessType: string | null;
  outlets: Array<{ id: string; name: string; city: string | null; state: string | null }>;
};

function formatBusinessType(value: string | null) {
  if (!value) return "Local experience partner";
  return value.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function DemoVendorCard({ vendor, index }: { vendor: DemoVendor; index: number }) {
  const { t: tCustomer } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
  const primaryOutlet = vendor.outlets[0];
  const location = [primaryOutlet?.city, primaryOutlet?.state].filter(Boolean).join(", ") || tCustomer("ui.labels.malaysia");
  const businessType = vendor.businessType
    ? tCustomer(`ui.vendor.businessTypes.${vendor.businessType}`)
    : tCustomer("ui.vendor.localExperiencePartner");

  return (
    <article className="atlas-stagger-card group overflow-hidden rounded-[22px] border border-[#d8deef] bg-white shadow-[0_14px_35px_rgba(1,0,102,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(1,0,102,0.12)]" style={{ "--atlas-delay": `${index * 70}ms` } as CSSProperties}>
      <Link href={`/customer/vendor/${vendor.id}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
        <div className="relative aspect-[1.5] overflow-hidden bg-secondary">
          {visual.coverUrl ? <>
            {/* Vendor-uploaded media is intentionally rendered as a normal img because storage hosts are runtime-configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.coverUrl} alt={tCustomer("ui.home.vendorCover", { vendor: vendor.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#00004d]/70 via-transparent to-transparent" />
          </> : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)] text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/10 text-2xl font-black tracking-tight shadow-xl backdrop-blur-sm">{visual.initials}</span>
            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{tCustomer("ui.search.localPartner")}</span>
          </div>}
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#0f172a]"><ShieldCheck size={12} aria-hidden="true" className="text-primary" /> {tCustomer("ui.labels.verifiedVendor")}</div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} aria-hidden="true" /> {location}</div>
        </div>
      </Link>
      <div className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/customer/vendor/${vendor.id}`} className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <h3 className="line-clamp-2 text-[13px] font-bold leading-5 text-[#0f172a]">{vendor.name}</h3>
          </Link>
           {visual.logoUrl ? (
             <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[#d8deef] bg-white p-0.5">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src={visual.logoUrl} alt="" className="h-full w-full object-cover" />
             </span>
          ) : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-sm font-bold text-[#010066]">{vendor.name.slice(0, 1)}</span>}
        </div>
        <p className="line-clamp-2 min-h-10 text-[11px] leading-5 text-[#64748b]">{vendor.description || tCustomer("ui.home.vendorDescription", { type: businessType, location: tCustomer("ui.labels.malaysia") })}</p>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#64748b]"><span className="inline-flex items-center gap-1.5"><Building2 size={12} aria-hidden="true" /> {tCustomer("ui.search.outletCount", { count: vendor.outlets.length })}</span><span className="truncate">{businessType}</span></div>
        <Link href={`/customer/vendor/${vendor.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#0f172a] transition group-hover:text-primary">{tCustomer("ui.actions.exploreVendor")} <ArrowRight size={13} aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

export function DesignDemoClient({ activities, recommended, vendors, initialState }: { activities: ComputedActivity[]; recommended: ComputedActivity[]; vendors: DemoVendor[]; initialState?: string }) {
  const { t: tCustomer } = useTranslation("customer");
  const tx = (key: string, defaultValue: string, options?: Record<string, unknown>) => tCustomer(key, { ...options });
  const router = useRouter();
  const [activeState, setActiveState] = useState(() => (
    MALAYSIA_DESTINATIONS.some((destination) => destination.state === initialState) ? initialState! : MALAYSIA_DESTINATIONS[0].state
  ));
  const [discoveryActivities, setDiscoveryActivities] = useState(activities);
  const [activeGuide, setActiveGuide] = useState(CITY_GUIDES[0].label);
  const { savedStates, toggleSaved } = useSavedDestinations();
  const [query, setQuery] = useState("");
  const [travelerCount, setTravelerCount] = useState(() => `2 ${tCustomer("ui.labels.people")}`);
  const [budgetRange, setBudgetRange] = useState("RM250–500/day");
  const [destinationPage, setDestinationPage] = useState(() => {
    const activeIndex = MALAYSIA_DESTINATIONS.findIndex((destination) => destination.state === initialState);
    return activeIndex >= 0 ? Math.floor(activeIndex / DESTINATIONS_PER_PAGE) + 1 : 1;
  });
  const [destinationRailPage, setDestinationRailPage] = useState(() => {
    const activeIndex = MALAYSIA_DESTINATIONS.findIndex((destination) => destination.state === initialState);
    return activeIndex >= 0 ? Math.floor(activeIndex / DESTINATION_RAIL_SIZE) + 1 : 1;
  });
  const [destinationRailSelection, setDestinationRailSelection] = useState(() => (
    MALAYSIA_DESTINATIONS.some((destination) => destination.state === initialState) ? initialState! : MALAYSIA_DESTINATIONS[0].state
  ));
  const [previewDestination, setPreviewDestination] = useState<typeof MALAYSIA_DESTINATIONS[number] | null>(null);
  const translatedPlaceholders = useMemo(() => PLACEHOLDER_TEXTS.map((fallback, index) => (
    tCustomer(`ui.designDemo.placeholder${index}`)
  )), [tCustomer]);
  const placeholderText = useTypewriterPlaceholder(translatedPlaceholders);
  const localizedGuides = useMemo(() => CITY_GUIDES.map((guide, index) => ({
    ...guide,
    label: tCustomer(`ui.designDemo.guide${index}.label`),
    eyebrow: tCustomer(`ui.designDemo.guide${index}.eyebrow`),
    description: tCustomer(`ui.designDemo.guide${index}.description`),
    detail: tCustomer(`ui.designDemo.guide${index}.detail`),
  })), [tCustomer]);

  useEffect(() => {
    if (!initialState) return;
    let cancelled = false;
    searchActivities({ state: initialState })
      .then((nextActivities) => {
        if (!cancelled) setDiscoveryActivities(nextActivities);
      })
      .catch(() => {
        if (!cancelled) setDiscoveryActivities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [initialState]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-atlas-reveal]"));
    if (!("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("atlas-reveal-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("atlas-reveal-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -8%" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const activeDestination = useMemo(
    () => MALAYSIA_DESTINATIONS.find((destination) => destination.state === activeState) ?? MALAYSIA_DESTINATIONS[0],
    [activeState],
  );
  const activeIndex = MALAYSIA_DESTINATIONS.findIndex((destination) => destination.state === activeDestination.state);
  const nextDestination = MALAYSIA_DESTINATIONS[(activeIndex + 1) % MALAYSIA_DESTINATIONS.length];
  const destinationRailStart = (destinationRailPage - 1) * DESTINATION_RAIL_SIZE;
  const destinationRailDestinations = MALAYSIA_DESTINATIONS.slice(destinationRailStart, destinationRailStart + DESTINATION_RAIL_SIZE);
  const destinationRailPageCount = Math.ceil(MALAYSIA_DESTINATIONS.length / DESTINATION_RAIL_SIZE);
  const destinationRailEnd = Math.min(destinationRailStart + DESTINATION_RAIL_SIZE, MALAYSIA_DESTINATIONS.length);
  const stateDemoHref = destinationHref(activeDestination.state);
  const experiencePool = [...discoveryActivities, ...recommended.filter((activity) => !discoveryActivities.some((item) => item.id === activity.id))];
  const activeGuideDetail = CITY_GUIDES.find((item) => item.label === activeGuide) ?? CITY_GUIDES[0];
  const activeGuideIndex = CITY_GUIDES.findIndex((item) => item.label === activeGuide);
  const activeGuideCopy = localizedGuides[activeGuideIndex >= 0 ? activeGuideIndex : 0];
  const GuideIcon = activeGuideDetail.icon;
  const vendorState = initialState ? activeState : "All Malaysia";
  const packagePick = experiencePool.find((activity) => vendorState === "All Malaysia" || activity.outlet.state === vendorState) ?? experiencePool[0];
  const packageHref = packagePick ? buildActivityPath(packagePick.id, "/customer") : stateDemoHref;
  const packageVendor = packagePick ? vendors.find((vendor) => vendor.id === packagePick.outlet.vendorId) : undefined;
  const filteredVendors = vendors.filter((vendor) => {
    return vendorState === "All Malaysia" || vendor.outlets.some((outlet) => outlet.state === vendorState);
  });
  const vendorPicks = filteredVendors.slice(0, 8);
  const destinationPageCount = Math.ceil(MALAYSIA_DESTINATIONS.length / DESTINATIONS_PER_PAGE);
  const destinationPageStart = (destinationPage - 1) * DESTINATIONS_PER_PAGE;
  const visibleDestinations = MALAYSIA_DESTINATIONS.slice(destinationPageStart, destinationPageStart + DESTINATIONS_PER_PAGE);
  const vendorCountForState = (state: string) => vendors.filter((vendor) => vendor.outlets.some((outlet) => outlet.state === state)).length;
  const experienceCountForState = (state: string) => activities.filter((activity) => activity.outlet.state === state).length;

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    router.push(trimmedQuery ? `/customer/search?q=${encodeURIComponent(trimmedQuery)}` : "/customer/explore");
  }

  function moveDestinationRail(direction: -1 | 1) {
    const nextPage = Math.min(destinationRailPageCount, Math.max(1, destinationRailPage + direction));
    setDestinationRailPage(nextPage);
  }

  function exploreDestination(state: string) {
    setPreviewDestination(null);
    router.push(destinationHref(state));
  }

  return (
    <div className="atlas-theme overflow-hidden bg-background text-foreground">
      <section className="relative isolate min-h-[calc(100svh-64px)] overflow-hidden bg-primary text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_12%,rgba(255,204,0,0.2),transparent_24%),radial-gradient(circle_at_8%_85%,rgba(84,112,210,0.18),transparent_30%),linear-gradient(125deg,#020044_0%,#05083d_58%,#0a243b_100%)]" />
        <div className="atlas-ambient absolute left-[55%] top-20 -z-10 h-72 w-72 rounded-full border border-white/10 sm:h-96 sm:w-96" />
        <div className="atlas-ambient atlas-ambient-delayed absolute left-[58%] top-32 -z-10 h-56 w-56 rounded-full border border-white/10 sm:h-72 sm:w-72" />

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 lg:px-8 lg:pb-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 lg:mb-7">
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-white/60"><Compass size={16} aria-hidden="true" className="text-[#ffcc00]" /> {ATLAS_BRAND_NAME}</div>
            <Link href="/customer/explore" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 transition hover:border-[#ffcc00] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/30">{tCustomer("ui.home.viewFullMap")} <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>

          <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)] md:gap-7 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:gap-16">
            <div className="max-w-2xl">
              <div className="atlas-enter atlas-delay-1 mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffcc00]/35 bg-[#ffcc00]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffcc00]"><Sparkles size={13} aria-hidden="true" /> {tCustomer("ui.home.heroKicker")}</div>
              <h1 className="atlas-enter atlas-delay-2 max-w-xl font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.96] tracking-[-0.04em] text-[#ffffff] sm:text-7xl">{tCustomer("ui.home.heroTitleStart")} <span className="text-[#ffcc00]">{tCustomer("ui.home.heroTitleAccent")}</span></h1>
              <p className="atlas-enter atlas-delay-3 mt-6 max-w-lg text-base leading-7 text-white/65 sm:text-lg">{tCustomer("ui.home.heroDescription")}</p>

              <form onSubmit={submitSearch} className="atlas-enter atlas-delay-4 mt-8 flex max-w-xl flex-col gap-2 rounded-[22px] border border-white/15 bg-white p-2 shadow-[0_18px_48px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search size={18} aria-hidden="true" className="shrink-0 text-[#64748b]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholderText} aria-label={tx("ui.home.searchAria", "Search Malaysia experiences")} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]" /></div>
                <button type="submit" className="atlas-shimmer inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#ffcc00] px-5 py-3 text-sm font-bold text-[#010066] transition hover:bg-[#ffcc00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40">{tx("ui.home.startExploring", "Start exploring")} <ArrowRight size={15} aria-hidden="true" /></button>
              </form>

              <div className="atlas-enter atlas-delay-5 mt-8 grid max-w-xl grid-cols-3 gap-4 border-t border-white/15 pt-5">
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">{MALAYSIA_DESTINATIONS.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{tx("ui.home.destinationCount", "destinations")}</p></div>
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">{activities.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{tx("ui.home.experienceCount", "local experiences")}</p></div>
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">∞</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{tx("ui.home.wanderWays", "ways to wander")}</p></div>
              </div>
            </div>

            <div className="atlas-enter atlas-delay-3 relative mx-auto min-h-[540px] w-full max-w-[460px] md:min-h-[500px] md:max-w-[390px] lg:min-h-[510px] lg:max-w-[500px]">
              <div className="atlas-depth-card absolute right-0 top-7 hidden w-[72%] rotate-[5deg] overflow-hidden rounded-[28px] border border-white/20 bg-[#11115f] shadow-2xl lg:block lg:top-10 lg:w-[68%]" aria-hidden="true">
                <div className="relative aspect-[0.72] opacity-80"><Image src={nextDestination.image} alt="" fill sizes="320px" className="object-cover" /><div className="absolute inset-0 bg-[#010066]/35" /></div>
              </div>
              <div className="atlas-note absolute left-0 top-14 z-30 hidden w-[80%] -rotate-[3deg] rounded-2xl border border-[#ffcc00]/40 bg-white px-4 py-3 text-[#0f172a] shadow-xl lg:block lg:left-2 lg:top-20 lg:w-[70%]">
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{tCustomer("ui.home.postcard", { current: String(activeIndex + 1).padStart(2, "0"), total: MALAYSIA_DESTINATIONS.length })}</span><MapPin size={15} aria-hidden="true" className="text-highlight-yellow" /></div>
                <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">{tCustomer("ui.home.keepClose")}</p>
              </div>
              <div key={activeDestination.state} className="atlas-active-card absolute bottom-0 right-0 z-20 w-full overflow-hidden rounded-[30px] border border-white/20 bg-black/20 shadow-[0_28px_70px_rgba(0,0,0,0.35)] lg:w-[82%]">
                <div className="relative aspect-[0.78]">
                  <Image src={activeDestination.image} alt={`${activeDestination.attraction}, ${activeDestination.state}`} fill sizes="(max-width: 768px) 46vw, 460px" priority className="atlas-active-image object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#00004d]/90 via-[#00004d]/10 to-transparent" />
                  <div className="atlas-mobile-note absolute left-5 top-5 z-30 w-[calc(100%-10rem)] max-w-[12rem] rounded-2xl border border-[#ffcc00]/40 bg-white/95 px-3 py-2.5 text-[#0f172a] shadow-lg backdrop-blur lg:hidden">
                    <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">{tCustomer("ui.home.postcard", { current: String(activeIndex + 1).padStart(2, "0"), total: MALAYSIA_DESTINATIONS.length })}</span><MapPin size={13} aria-hidden="true" className="shrink-0 text-highlight-yellow" /></div>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-base font-bold leading-tight">{tCustomer("ui.home.keepClose")}</p>
                  </div>
                  <div className="atlas-mobile-spotlight absolute right-5 top-5 z-30 rounded-2xl border border-white/20 bg-[#00004d]/90 px-3 py-2.5 text-right shadow-lg backdrop-blur lg:hidden"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{tCustomer("ui.home.spotlight")}</p><p className="mt-1 text-xs font-bold text-white">{activeDestination.state}</p><p className="mt-1 hidden text-[10px] text-[#ffcc00] sm:block">{tCustomer("strictMigration.home.guidePlan", { guide: activeGuide })}</p></div>
                  <div className="atlas-desktop-spotlight absolute right-5 top-5 z-30 hidden rounded-2xl border border-white/20 bg-[#00004d]/90 px-4 py-3 text-right shadow-lg backdrop-blur lg:block"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{tCustomer("ui.home.spotlight")}</p><p className="mt-1 text-sm font-bold text-white">{activeDestination.state}</p><p className="mt-1 text-[11px] text-[#ffcc00]">{tCustomer("strictMigration.home.guidePlan", { guide: activeGuide })}</p></div>
                  <div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffcc00]">{activeDestination.zone}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-white sm:text-6xl">{activeDestination.state}</h2><p className="mt-3 text-sm font-semibold text-white/85">{activeDestination.attraction}</p><p className="mt-1 text-xs leading-5 text-white/60">{activeDestination.tagline}</p><div className="mt-5 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setPreviewDestination(activeDestination)} className="atlas-press inline-flex items-center gap-2 rounded-full bg-[#ffcc00] px-4 py-2.5 text-xs font-bold text-[#010066] transition hover:bg-[#ffcc00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40">{tx("ui.map.viewDestination", "View destination")} <ArrowUpRight size={14} aria-hidden="true" /></button><button type="button" onClick={() => void toggleSaved(activeDestination.state)} aria-pressed={savedStates.has(activeDestination.state)} className="atlas-press inline-flex items-center gap-2 rounded-full border border-white/30 bg-[#00004d]/35 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur transition hover:border-[#ffcc00] hover:bg-[#00004d]/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40"><Bookmark size={14} aria-hidden="true" fill={savedStates.has(activeDestination.state) ? "currentColor" : "none"} /> {savedStates.has(activeDestination.state) ? tx("ui.home.savedToAtlas", "Saved to your atlas") : tx("ui.home.saveFeeling", "Save this feeling")}</button></div></div>
                </div>
              </div>
            </div>
          </div>

          <nav aria-label={tx("ui.home.destinationCarousel", "Destination carousel")} className="mt-8 border-t border-white/15 pt-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffcc00]">{tCustomer("ui.home.explorationPrompt")}</p>
                <p className="mt-1 text-xs text-white/55">{tCustomer("ui.home.swipeDestinations", { count: MALAYSIA_DESTINATIONS.length })}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-[#ffcc00]">{String(destinationRailStart + 1).padStart(2, "0")}–{String(destinationRailEnd).padStart(2, "0")} / {MALAYSIA_DESTINATIONS.length}</span>
                  <div role="group" aria-label={tCustomer("ui.pagination.showing", { from: destinationRailStart + 1, to: destinationRailEnd, total: MALAYSIA_DESTINATIONS.length, items: tCustomer("ui.home.destinationCount") })} className="flex w-28 items-center gap-1 sm:w-36">
                    {MALAYSIA_DESTINATIONS.map((destination, index) => (
                      <span key={destination.state} aria-hidden="true" className={`h-1 flex-1 rounded-full transition-colors duration-300 ${index >= destinationRailStart && index < destinationRailEnd ? "bg-[#ffcc00]" : "bg-white/20"}`} />
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => moveDestinationRail(-1)} disabled={destinationRailPage === 1} aria-label={tCustomer("ui.pagination.previousPage", { item: tCustomer("ui.home.destinationCount") })} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/75 transition hover:border-[#ffcc00] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><ArrowRight aria-hidden="true" className="rotate-180" size={14} /></button>
                <button type="button" onClick={() => moveDestinationRail(1)} disabled={destinationRailPage === destinationRailPageCount} aria-label={tCustomer("ui.pagination.nextPage", { item: tCustomer("ui.home.destinationCount") })} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/75 transition hover:border-[#ffcc00] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><ArrowRight aria-hidden="true" size={14} /></button>
              </div>
            </div>

            <div key={destinationRailStart} className="atlas-rail-page mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible">
              {destinationRailDestinations.map((destination) => {
                const isRailSelected = destination.state === destinationRailSelection;
                return (
                <button key={destination.state} type="button" onClick={() => { setDestinationRailSelection(destination.state); setActiveState(destination.state); }} aria-pressed={isRailSelected} className={`group relative block min-w-[72%] snap-start overflow-hidden rounded-2xl border text-left transition sm:min-w-0 ${isRailSelected ? "border-[#ffcc00] ring-2 ring-[#ffcc00]/35" : "border-white/15 hover:border-white/40"}`}>
                    <div className="relative aspect-[1.65]">
                      <Image src={destination.image} alt={destination.state} fill sizes="(max-width: 640px) 72vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#00004d]/90 via-[#00004d]/15 to-transparent" />
                      <div className="absolute inset-x-3 bottom-3">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#ffcc00]">{destination.zone}</p>
                        <p className="mt-1 text-sm font-bold text-white">{destination.state}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </section>

      <section id="trip-builder" data-atlas-reveal className="atlas-reveal border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-2xl"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tx("ui.designDemo.firstStep", "A useful first step")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-[-0.03em] text-[#0f172a] sm:text-5xl">{tx("ui.designDemo.planTitle", "Plan with a local partner.")}</h2><p className="mt-4 max-w-xl text-sm leading-6 text-[#64748b]">{tx("ui.designDemo.planDescription", "Start with the kind of day you want. Then meet the vendor, choose the outlet, and see the exact package before you buy.")}</p></div>

          <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] lg:items-stretch">
            <div className="grid gap-3 sm:grid-cols-2">
              {CITY_GUIDES.map((guide, index) => {
                const Icon = guide.icon;
                const selected = guide.label === activeGuide;
                return <button key={guide.label} type="button" onClick={() => setActiveGuide(guide.label)} aria-pressed={selected} className={`atlas-pulse-option group rounded-[22px] border p-5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-[0_16px_32px_rgba(1,0,102,0.18)]" : "border-border bg-white text-[#0f172a] hover:-translate-y-1 hover:border-primary/60"}`} style={{ "--atlas-delay": `${index * 70}ms` } as CSSProperties}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected ? "bg-white/15 text-[#ffcc00]" : "bg-secondary text-primary"}`}><Icon size={19} aria-hidden="true" /></span><span className="mt-6 block text-sm font-bold">{tx(`ui.designDemo.guide${index}.label`, guide.label)}</span><span className={`mt-2 block text-xs leading-5 ${selected ? "text-white/70" : "text-[#64748b]"}`}>{tx(`ui.designDemo.guide${index}.eyebrow`, guide.eyebrow)}</span></button>;
              })}
            </div>

            <div key={activeGuide} className="atlas-ticket relative h-fit overflow-hidden rounded-[28px] border border-[#c5cfee] bg-white p-6 text-[#0f172a] shadow-[0_20px_45px_rgba(1,0,102,0.10)] sm:p-7"><div className="absolute right-6 top-6 flex h-16 w-16 rotate-[-10deg] items-center justify-center rounded-full border-2 border-dashed border-[#ffcc00]/70 text-center text-[9px] font-bold uppercase leading-3 tracking-[0.12em] text-[#ffcc00]">{BRAND_NAME}<br />{ATLAS_PRODUCT_NAME}</div><div className="relative"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#010066]"><GuideIcon size={14} aria-hidden="true" /> {tx("ui.designDemo.tripBuilder", "Trip builder")} / {String(activeGuideIndex + 1).padStart(2, "0")}</div><div className="mt-6 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]"><span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-[#010066]">{tx("ui.designDemo.styleStep", "1 Style")}</span><span aria-hidden="true">→</span><span>{tx("ui.designDemo.vendorStep", "2 Vendor")}</span><span aria-hidden="true">→</span><span>{tx("ui.designDemo.outletStep", "3 Outlet")}</span><span aria-hidden="true">→</span><span>{tx("ui.designDemo.packageStep", "4 Package")}</span></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#010066]">{activeGuideCopy.eyebrow}</p><h3 className="mt-2 max-w-[16rem] font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[#0f172a]">{activeDestination.state}, {activeDestination.zone}</h3><p className="mt-3 max-w-md text-sm leading-6 text-[#64748b]">{activeGuideCopy.description}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">{tx("ui.designDemo.travellers", "Travellers")}<select aria-label={tx("ui.designDemo.travellers", "Travellers")} value={travelerCount} onChange={(event) => setTravelerCount(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#c5cfee] bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#0f172a] outline-none focus:border-[#010066]"><option>{tx("ui.designDemo.oneTraveller", "1 traveller")}</option><option>{tx("ui.designDemo.twoTravellers", "2 travellers")}</option><option>{tx("ui.designDemo.threeTravellers", "3 travellers")}</option><option>{tx("ui.designDemo.fourTravellers", "4+ travellers")}</option></select></label><label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">{tx("ui.designDemo.comfortRange", "Comfort range")}<select aria-label={tx("ui.designDemo.comfortRange", "Comfort range")} value={budgetRange} onChange={(event) => setBudgetRange(event.target.value)} className="mt-1 block w-full rounded-xl border border-[#c5cfee] bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-[#0f172a] outline-none focus:border-[#010066]"><option>{tx("ui.designDemo.budgetUnder100", "Under RM100/day")}</option><option>{tx("ui.designDemo.budget100To250", "RM100–250/day")}</option><option>{tx("ui.designDemo.budget250To500", "RM250–500/day")}</option><option>{tx("ui.designDemo.budget500Plus", "RM500+/day")}</option></select></label></div><div className="my-5 grid grid-cols-3 gap-3 border-y border-[#c5cfee] py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">{tx("ui.designDemo.startAt", "Start at")}</p><p className="mt-1 text-sm font-bold">{activeDestination.attraction}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">{tx("ui.designDemo.thenChoose", "Then choose")}</p><p className="mt-1 text-sm font-bold">{tx("ui.designDemo.verifiedVendor", "Verified vendor")}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">{tx("ui.designDemo.yourBrief", "Your brief")}</p><p className="mt-1 text-sm font-bold">{travelerCount}</p></div></div>{packagePick ? <div className="rounded-2xl border border-[#c5cfee] bg-white p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#010066]">{tx("ui.designDemo.availableNext", "Available next")}</p><span className="text-[10px] font-semibold text-[#64748b]">{budgetRange}</span></div><p className="mt-1 truncate text-sm font-bold text-[#0f172a]">{packagePick.name}</p><p className="mt-1 text-xs text-[#64748b]">{tx("ui.designDemo.packageHint", "Open the package to choose its outlet, time or option before checkout.")}</p></div> : <p className="rounded-2xl border border-dashed border-[#c5cfee] p-3 text-xs leading-5 text-[#64748b]">{activeGuideCopy.detail}</p>}<div className="mt-5 flex flex-wrap gap-3"><Link href={packageHref} className="atlas-press inline-flex items-center gap-2 rounded-full bg-[#010066] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#00004d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">{tx("ui.designDemo.explorePackage", "Explore a package")} <ArrowRight size={14} aria-hidden="true" /></Link>{packageVendor ? <Link href={`/customer/vendor/${packageVendor.id}`} className="inline-flex items-center gap-2 rounded-full border border-primary/25 px-4 py-2.5 text-xs font-bold text-[#010066] transition hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15">{tx("ui.designDemo.meetVendor", "Meet the vendor")} <ArrowRight size={14} aria-hidden="true" /></Link> : null}</div></div></div>
          </div>
        </div>
      </section>

      <section id="atlas-results" data-atlas-reveal className="atlas-reveal mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-7"><div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-[#ffcc00]/70 bg-[#010066] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffcc00] shadow-[0_8px_20px_rgba(1,0,102,0.14)]"><Sparkles size={14} aria-hidden="true" /> {tx("ui.designDemo.featuredPartners", "Featured local partners")} <span className="h-1 w-1 rounded-full bg-[#ffcc00]/70" /><span className="text-white/75">{tx("ui.designDemo.nextStop", "For your next stop")}</span></div><h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-[-0.03em] text-[#0f172a] sm:text-5xl">{tx("ui.designDemo.peopleBehind", "Meet the people behind your next good stop.")}</h2><p className="mt-4 max-w-xl text-sm leading-6 text-[#64748b]">{tx("ui.designDemo.vendorLead", "Start with a verified vendor. Their profile leads to the right outlet, then to the food, activity or package that fits your trip.")}</p></div></div>

        <div className="mt-8 rounded-[30px] border border-[#c5cfee] bg-[#eef2ff] p-6 shadow-[0_14px_35px_rgba(1,0,102,0.05)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#010066] text-white"><ShieldCheck size={19} aria-hidden="true" /></span><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#010066]">{tx("ui.designDemo.vendorFirst", "Vendor-first discovery")}</p></div>
              <h3 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[#0f172a] sm:text-3xl">{tx("ui.designDemo.partnerFirst", "Find the partner first, then choose the exact outlet or experience.")}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748b]">{tx("ui.designDemo.vendorCardHint", "Every verified card opens a vendor profile with its active locations. This keeps the journey clear from partner, to outlet, to booking.")}</p>
            </div>
          </div>
        </div>

        <div className="mt-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#0f172a]">{tx("ui.designDemo.verifiedPartners", "Verified local partners")}</p><p className="mt-1 text-xs text-[#64748b]">{tx("ui.designDemo.partnerThenOutlet", "Start with the partner, then choose an outlet.")}</p></div><p className="text-xs font-semibold text-[#64748b]">{tx("ui.designDemo.approvedVendors", "{{count}} approved vendors", { count: filteredVendors.length })}</p></div>
        {vendorPicks.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{vendorPicks.map((vendor, index) => <DemoVendorCard key={vendor.id} vendor={vendor} index={index} />)}</div> : <div className="mt-4 rounded-[24px] border border-dashed border-[#c5cfee] bg-white p-8 text-sm leading-6 text-[#64748b]">{tx("ui.designDemo.noVendors", "No verified partners match this route yet. Try another state.")}</div>}
        <div className="mt-7 flex justify-end border-t border-[#d8deef] pt-5"><Link href="/customer/search" className="inline-flex items-center gap-2 rounded-full bg-[#010066] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(1,0,102,0.14)] transition hover:bg-[#00004d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/25">{tx("ui.designDemo.viewAllVendors", "View all vendors")} <ArrowRight size={15} aria-hidden="true" /></Link></div>
      </section>

      <section data-atlas-reveal className="atlas-reveal border-y border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tx("ui.designDemo.keepWandering", "Keep wandering")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-[#0f172a]">{tx("ui.designDemo.nextRegion", "Discover your next region.")}</h2><p className="mt-2 max-w-xl text-sm text-[#64748b]">{tx("ui.designDemo.regionDescription", "Explore another part of Malaysia through the vendors and outlets already waiting there.")}</p></div><Link href="/customer/explore" className="inline-flex items-center gap-2 text-sm font-bold text-[#010066] transition hover:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066]/40">{tx("ui.home.viewAllDestinations", "View all destinations")} <ArrowRight size={15} aria-hidden="true" /></Link></div><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleDestinations.map((destination) => <Link key={destination.state} href={`/customer?state=${encodeURIComponent(destination.state)}`} onClick={(event) => { event.preventDefault(); setPreviewDestination(destination); }} className="group relative overflow-hidden rounded-[22px] border border-[#d8deef] bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20"><div className="relative aspect-[1.8]"><Image src={destination.image} alt={destination.state} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-x-4 bottom-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ffcc00]">{destination.zone}</p><p className="mt-1 text-lg font-bold text-white">{destination.state}</p></div></div><div className="flex items-center justify-between gap-3 p-3.5"><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#64748b]">{destination.tagline}</p><p className="mt-1 text-[11px] text-[#64748b]">{tx("ui.designDemo.vendorExperienceCount", "{{vendors}} vendors · {{experiences}} experiences", { vendors: vendorCountForState(destination.state), experiences: experienceCountForState(destination.state) })}</p></div><ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-[#010066]" /></div></Link>)}</div><div className="mt-7 flex flex-col gap-4 border-t border-[#d8deef] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold text-[#64748b]">{tx("ui.pagination.showing", "Showing {{from}}–{{to}} of {{total}} destinations", { from: destinationPageStart + 1, to: Math.min(destinationPageStart + DESTINATIONS_PER_PAGE, MALAYSIA_DESTINATIONS.length), total: MALAYSIA_DESTINATIONS.length })}</p><nav aria-label={tx("ui.pagination.pages", "Destination pages")} className="flex items-center gap-1.5"><button type="button" onClick={() => setDestinationPage((page) => Math.max(1, page - 1))} disabled={destinationPage === 1} aria-label={tx("ui.pagination.previousPage", "Previous destination page")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#c5cfee] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ArrowRight aria-hidden="true" className="rotate-180" size={14} /></button>{Array.from({ length: destinationPageCount }, (_, index) => index + 1).map((page) => <button key={page} type="button" onClick={() => setDestinationPage(page)} aria-current={destinationPage === page ? "page" : undefined} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold transition ${destinationPage === page ? "bg-[#010066] text-white" : "border border-[#c5cfee] text-[#64748b] hover:border-[#010066] hover:text-[#010066]"}`}>{page}</button>)}<button type="button" onClick={() => setDestinationPage((page) => Math.min(destinationPageCount, page + 1))} disabled={destinationPage === destinationPageCount} aria-label={tx("ui.pagination.nextPage", "Next destination page")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#c5cfee] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ArrowRight aria-hidden="true" size={14} /></button></nav></div></div>
      </section>

      <DestinationPreviewModal destination={previewDestination} onClose={() => setPreviewDestination(null)} onExplore={exploreDestination} />

      <section data-atlas-reveal className="atlas-reveal bg-background px-4 py-7 sm:px-6 sm:py-8"><div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[24px] border border-[#d8deef] bg-white px-5 py-5 shadow-[0_14px_35px_rgba(1,0,102,0.06)] sm:flex-row sm:items-center sm:justify-between sm:px-7"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tx("ui.designDemo.notSure", "Not sure where to start?")}</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-[#0f172a]">{tx("ui.designDemo.nextMove", "Choose your next move.")}</h2></div><div className="flex flex-wrap gap-2"><Link href="/customer/explore" className="inline-flex items-center gap-2 rounded-full bg-[#010066] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#00004d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/25"><Compass size={14} aria-hidden="true" /> {tx("ui.designDemo.browseMap", "Browse the map")}</Link><Link href="#trip-builder" className="inline-flex items-center gap-2 rounded-full border border-[#c5cfee] px-4 py-2.5 text-xs font-bold text-[#010066] transition hover:border-[#010066] hover:text-[#010066] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/15"><Route size={14} aria-hidden="true" /> {tx("ui.designDemo.buildRoute", "Build a route")}</Link><Link href="/customer/wishlist" className="inline-flex items-center gap-2 rounded-full border border-[#c5cfee] px-4 py-2.5 text-xs font-bold text-[#010066] transition hover:border-[#010066] hover:text-[#010066] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/15"><Bookmark size={14} aria-hidden="true" /> {tx("ui.designDemo.savedPlaces", "Saved places")}</Link></div></div></section>

      <style jsx>{`
        :global(:root) {
          --atlas-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
          --atlas-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        }

        .atlas-enter {
          animation: atlas-enter 900ms var(--atlas-ease-out) both;
        }

        .atlas-delay-1 { animation-delay: 80ms; }
        .atlas-delay-2 { animation-delay: 150ms; }
        .atlas-delay-3 { animation-delay: 230ms; }
        .atlas-delay-4 { animation-delay: 330ms; }
        .atlas-delay-5 { animation-delay: 430ms; }

        .atlas-reveal {
          opacity: 0;
          transform: translateY(34px);
          transition: opacity 760ms var(--atlas-ease-out), transform 900ms var(--atlas-ease-out);
        }

        .atlas-reveal-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .atlas-ambient {
          animation: atlas-orbit 18s var(--atlas-ease-in-out) infinite alternate;
          transform-origin: 50% 50%;
        }

        .atlas-ambient-delayed { animation-delay: -7s; animation-direction: alternate-reverse; }

        .atlas-depth-card { animation: atlas-depth-drift 8s var(--atlas-ease-in-out) infinite alternate; }

        .atlas-note { animation: atlas-note-float 6s ease-in-out infinite; }

        .atlas-active-card { animation: atlas-card-in 720ms var(--atlas-ease-out) both; }

        .atlas-active-image { animation: atlas-photo-breathe 16s var(--atlas-ease-in-out) infinite alternate; }

        .atlas-rail-page {
          perspective: 900px;
          animation: atlas-rail-page 460ms var(--atlas-ease-out) both;
        }

        .atlas-atlas-card { transition-property: transform, box-shadow, border-color; transition-timing-function: var(--atlas-ease-out); }

        .atlas-atlas-card-active { animation: atlas-active-pulse 2.8s ease-in-out infinite; }

        .atlas-state-menu {
          transform-origin: 20px 0;
          animation: atlas-menu-in 180ms var(--atlas-ease-out) both;
        }

        .atlas-stagger-card {
          animation: atlas-card-in 700ms var(--atlas-ease-out) both;
          animation-delay: var(--atlas-delay);
          animation-play-state: paused;
        }

        .atlas-reveal-visible .atlas-stagger-card { animation-play-state: running; }

        .atlas-pulse-option {
          animation: atlas-card-in 700ms var(--atlas-ease-out) both;
          animation-delay: var(--atlas-delay);
          animation-play-state: paused;
          transition-property: transform, box-shadow, border-color, background-color, color;
          transition-duration: 280ms;
          transition-timing-function: var(--atlas-ease-out);
        }

        .atlas-reveal-visible .atlas-pulse-option { animation-play-state: running; }

        .atlas-ticket {
          animation: atlas-ticket-in 560ms var(--atlas-ease-out) both;
        }

        .atlas-ticket::before,
        .atlas-ticket::after {
          position: absolute;
          top: 50%;
          height: 26px;
          width: 26px;
          content: "";
          border: 1px solid #c5cfee;
          border-radius: 999px;
          background: #ffffff;
          transform: translateY(-50%);
        }

        .atlas-ticket::before { left: -14px; }
        .atlas-ticket::after { right: -14px; }

        .atlas-press {
          transition-property: transform, background-color, border-color, color, box-shadow;
          transition-duration: 160ms;
          transition-timing-function: var(--atlas-ease-out);
        }

        .atlas-press:active { transform: scale(0.97); }

        .atlas-cta-orbit { animation: atlas-cta-orbit 4s var(--atlas-ease-in-out) infinite; }

        .atlas-shimmer {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          transform: translateZ(0);
        }

        .atlas-shimmer::after {
          position: absolute;
          inset: 0 auto 0 -45%;
          width: 36%;
          content: "";
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.54), transparent);
          transform: skewX(-18deg);
          animation: atlas-sheen 4.8s var(--atlas-ease-in-out) infinite;
          pointer-events: none;
        }

        .atlas-shimmer > :global(*) { position: relative; z-index: 1; }

        @keyframes atlas-enter {
          from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes atlas-orbit {
          from { transform: rotate(-9deg) scale(0.96); opacity: 0.55; }
          to { transform: rotate(8deg) scale(1.05); opacity: 1; }
        }

        @keyframes atlas-depth-drift {
          from { transform: translate3d(0, 0, 0) rotate(5deg); }
          to { transform: translate3d(-12px, -10px, 0) rotate(8deg); }
        }

        @keyframes atlas-note-float {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-3deg); }
          50% { transform: translate3d(0, -9px, 0) rotate(-1deg); }
        }

        @keyframes atlas-card-in {
          from { opacity: 0; transform: translate3d(0, 26px, 0) scale(0.97); filter: blur(3px); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }

        @keyframes atlas-rail-page {
          from { opacity: 0; transform: translate3d(28px, 0, 0) rotateY(-8deg) scale(0.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) rotateY(0) scale(1); }
        }

        @keyframes atlas-photo-breathe {
          from { transform: scale(1.02); }
          to { transform: scale(1.09); }
        }

        @keyframes atlas-mood-in {
          from { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.985); filter: blur(2px); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }

        @keyframes atlas-ticket-in {
          from { opacity: 0; transform: translate3d(24px, 0, 0) rotate(1deg) scale(0.985); filter: blur(3px); }
          to { opacity: 1; transform: translate3d(0, 0, 0) rotate(0) scale(1); filter: blur(0); }
        }

        @keyframes atlas-active-pulse {
           0%, 100% { box-shadow: 0 0 0 0 rgba(255,204,0,0.14); }
           50% { box-shadow: 0 0 0 5px rgba(255,204,0,0.08); }
        }

        @keyframes atlas-menu-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes atlas-cta-orbit {
          0%, 100% { transform: rotate(-5deg) translateY(0); }
          50% { transform: rotate(5deg) translateY(-5px); }
        }

        @keyframes atlas-sheen {
          0%, 35% { transform: translateX(0) skewX(-18deg); opacity: 0; }
          50% { opacity: 1; }
          75%, 100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
        }

        @media (hover: hover) and (pointer: fine) {
          .atlas-shimmer:hover::after { animation-duration: 1.6s; }
        }

        @media (prefers-reduced-motion: reduce) {
          .atlas-enter,
          .atlas-depth-card,
          .atlas-note,
          .atlas-active-card,
          .atlas-active-image,
          .atlas-rail-page,
          .atlas-pulse-option,
          .atlas-ticket,
          .atlas-atlas-card-active,
          .atlas-stagger-card,
          .atlas-cta-orbit,
          .atlas-shimmer::after,
          .atlas-ambient,
          .atlas-state-menu {
            animation: none;
          }

          .atlas-reveal,
          .atlas-reveal-visible {
            opacity: 1;
            transform: none;
            transition: opacity 200ms ease;
          }

          .atlas-active-image { transform: none; }

          .atlas-press:active { transform: none; }
        }
      `}</style>
    </div>
  );
}
