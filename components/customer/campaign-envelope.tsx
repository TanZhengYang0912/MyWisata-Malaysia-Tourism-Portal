"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Mail, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { initials } from "@/components/customer/campaign-stall-strip";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Button } from "@/components/ui/button";
import { buildZipStrip, createEnvelopeGeometry, foldMatrix, letterRise, nextEnvelopeAction, toPolygon, type EnvelopeGeometry, type EnvelopeState } from "@/lib/customer/envelope-tear";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatEventDate, formatEventDateRange, formatEventHours, getEventOperationalLabelKey, getNextEventSession } from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const PIECES = ["bottom", "top", "flap"] as const;
const DOUBLE_CLICK_MS = 260;
const NAVIGATE_AFTER_MS = 300;

/**
 * The home spotlight's campaign card: an airmail envelope whose strip tears off
 * and whose letter floats up with the details. Hover (or a tap on touch screens)
 * opens it; a double click or double tap goes to the event page.
 */
export function CampaignEnvelope({ campaign, imagePriority = false }: { campaign: PromotionCampaignPublic; imagePriority?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const router = useRouter();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const href = `/customer/events/${encodeURIComponent(campaign.slug)}`;
  const gradientId = useId();
  const titleId = `campaign-envelope-${campaign.id}-title`;

  const rootRef = useRef<HTMLElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLDivElement>(null);
  const bitsRef = useRef<HTMLDivElement>(null);
  // Each piece's parts, keyed "<piece>:<part>" (pc, fold, art, shade, svg, roll, gradient).
  const partRefs = useRef<Record<string, Element | null>>({});
  const partRef = (key: string) => (el: Element | null) => { partRefs.current[key] = el; };

  const formatCampaignDate = isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime;
  const startLabel = formatCampaignDate(campaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" });
  const endLabel = formatCampaignDate(campaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" });
  const placeNames = [...new Set(campaign.locations.map((location) => location.name))];
  const session = getNextEventSession(campaign.locations);
  const image = campaign.posterUrl;
  const unoptimized = Boolean(image && (image.startsWith("http://") || image.startsWith("https://")));
  const firstLocation = campaign.locations[0];

  useEffect(() => {
    const root = rootRef.current, under = underRef.current, letter = letterRef.current, bits = bitsRef.current;
    const part = <T extends Element>(k: string, name: string) => partRefs.current[`${k}:${name}`] as T | null | undefined;
    const captureParts = (k: string) => {
      const pc = part<HTMLElement>(k, "pc"), fold = part<HTMLElement>(k, "fold"), art = part<HTMLElement>(k, "art"), shade = part<HTMLElement>(k, "shade");
      const svg = part<SVGElement>(k, "svg"), roll = part<SVGElement>(k, "roll"), gradient = part<SVGElement>(k, "gradient");
      return pc && fold && art && shade && svg && roll && gradient ? { pc, fold, art, shade, svg, roll, gradient } : null;
    };
    const bottom = captureParts("bottom"), top = captureParts("top"), flap = captureParts("flap");
    if (!root || !under || !letter || !bits || !bottom || !top || !flap) return;
    // Callback refs can be cleared on re-render or unmount; one effect owns one complete snapshot.
    const parts = { bottom, top, flap };
    const pieces = { bottom: bottom.pc, top: top.pc, flap: flap.pc };
    const media = (query: string) => window.matchMedia?.(query).matches ?? false;
    const tapMode = () => media("(hover: none)");
    const reduce = () => media("(prefers-reduced-motion: reduce)");

    let geo: EnvelopeGeometry, progress = 0, state: EnvelopeState = "closed", rise = 0, raf = 0, clickTimer: ReturnType<typeof setTimeout> | undefined, navTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false, hovering = false, focusInside = false, tapOpen = false, openAnims: Animation[] = [];
    const setState = (next: EnvelopeState) => { state = next; root.setAttribute("data-state", next); };

    function draw(value: number) {
      if (disposed) return;
      progress = value;
      for (const piece of buildZipStrip(value, geo)) {
        const { pc: el, fold, art, shade, svg, roll, gradient } = parts[piece.k];
        if (!piece.outer || !piece.inner) { el.style.display = "none"; continue; }
        el.style.display = "";
        fold.style.clipPath = toPolygon(piece.outer);
        art.style.clipPath = toPolygon(piece.inner);
        const f = piece.fold;
        if (f && f.phi > 0.5) {
          const phi = f.phi * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi), d = f.toward;
          fold.style.transform = foldMatrix(f.h1, f.h2, phi);
          fold.setAttribute("data-back", String(c < 0));
          const angle = Math.atan2(d.x, -d.y) * 180 / Math.PI, span = Math.abs(geo.W * d.x) + Math.abs(geo.H * d.y);
          const at = (x: number, y: number) => 50 + ((x - geo.W / 2) * d.x + (y - geo.H / 2) * d.y) / span * 100;
          const hinge = at(f.h1.x, f.h1.y), far = Math.max(...piece.outer.map(([x, y]) => at(x, y)));
          shade.style.background = c < 0
            ? `linear-gradient(${angle}deg, transparent ${hinge - 0.5}%, rgba(40,30,0,.34) ${hinge}%, rgba(40,30,0,.08) ${hinge + (far - hinge) * 0.3}%, rgba(255,255,255,.28) ${far}%)`
            : `linear-gradient(${angle}deg, transparent ${hinge - 0.5}%, rgba(0,0,30,${0.45 * s}) ${hinge}%, rgba(0,0,30,${0.12 * s}) ${far}%)`;
          el.style.filter = `drop-shadow(${3 + 5 * s}px ${8 + 10 * s}px ${8 + 12 * s}px rgba(10,10,40,${0.22 + 0.16 * s}))`;
          const m = c < 0 ? { x: -d.x, y: -d.y } : d, w = 5 + 11 * s;
          roll.setAttribute("points", [f.h1, f.h2, { x: f.h2.x + m.x * w, y: f.h2.y + m.y * w }, { x: f.h1.x + m.x * w, y: f.h1.y + m.y * w }].map((pt) => `${pt.x},${pt.y}`).join(" "));
          gradient.setAttribute("x1", String(f.h1.x)); gradient.setAttribute("y1", String(f.h1.y));
          gradient.setAttribute("x2", String(f.h1.x + m.x * w)); gradient.setAttribute("y2", String(f.h1.y + m.y * w));
          svg.style.display = "";
        } else {
          fold.style.transform = ""; fold.setAttribute("data-back", "false"); shade.style.background = ""; el.style.filter = "";
          svg.style.display = "none";
        }
      }
    }

    function layout() {
      if (disposed) return;
      const width = root!.clientWidth || 0, narrow = width < 640;
      geo = createEnvelopeGeometry(width, narrow);
      root!.setAttribute("data-narrow", String(narrow));
      for (const [name, value] of Object.entries({ h0: geo.H, a: geo.a, sh: geo.sh, tuck: geo.tuck })) root!.style.setProperty(`--${name}`, `${value}px`);
      root!.style.height = `${geo.H}px`;
      draw(progress);
    }

    function tween(to: number, duration: number, easing = (x: number) => 1 - Math.pow(1 - x, 3)) {
      cancelAnimationFrame(raf);
      const from = progress, start = performance.now();
      return new Promise<void>((done) => {
        if (reduce()) { draw(to); done(); return; }
        const tick = (now: number) => {
          if (disposed) return;
          // A frame's timestamp can predate `start`; clamp so progress never goes negative.
          const x = Math.max(0, Math.min(1, (now - start) / duration));
          draw(from + (to - from) * easing(x));
          if (x < 1) raf = requestAnimationFrame(tick); else done();
        };
        raf = requestAnimationFrame(tick);
      });
    }
    const play = (el: Element, frames: Keyframe[], duration: number, options: KeyframeAnimationOptions = {}) =>
      el.animate(frames, { duration: reduce() ? 1 : duration, fill: "forwards", easing: "cubic-bezier(.3,1.2,.4,1)", ...options });

    function burst(x: number, y: number) {
      if (reduce()) return;
      for (let i = 0; i < 14; i++) {
        const bit = document.createElement("i");
        bit.style.left = `${x}px`; bit.style.top = `${y - 10}px`;
        bits!.append(bit);
        bit.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 160}px,${60 + Math.random() * 140}px) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0 }],
          { duration: 700 + Math.random() * 500, easing: "cubic-bezier(.2,.6,.5,1)", fill: "forwards" }).finished.then(() => bit.remove(), () => bit.remove());
      }
    }

    // Cancelled animations reject `finished`; an unmount mid-animation must not surface that.
    const run = (task: Promise<void>) => { task.catch(() => {}); };
    const wantOpen = () => (tapMode() ? tapOpen : hovering) || focusInside;
    function sync() {
      if (disposed) return;
      const action = nextEnvelopeAction(state, wantOpen());
      if (action === "open") run(openEnvelope());
      else if (action === "close") run(closeEnvelope());
    }

    /** `settle: false` leaves it open without re-checking the wish, for a navigation that follows at once. */
    async function openEnvelope(fast = false, settle = true) {
      if (disposed) return;
      setState("busy");
      await tween(1, fast ? 300 : 480, (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2));
      if (disposed) return;
      const end = geo.L1.pts[geo.L1.n];
      burst(end.x, end.y);
      const headerBottom = parseFloat(window.getComputedStyle?.(document.documentElement)?.getPropertyValue?.("--customer-header-h") ?? "") || 0;
      rise = letterRise({ a: geo.a, sh: geo.sh, tuck: geo.tuck, letterHeight: letter!.offsetHeight || 0, cardTop: root!.getBoundingClientRect?.().top ?? 0, headerBottom });
      openAnims = [
        play(pieces.flap, [{ transform: "none", opacity: 1 }, { transform: `translate(${geo.W * 0.12}px,-40px) rotate(12deg)`, opacity: 0 }], 460, { easing: "cubic-bezier(.4,0,.6,1)" }),
        play(pieces.top, [{ transform: "none", opacity: 1 }, { transform: "translate(-10px,-46px) rotate(-4deg)", opacity: 0 }], 440, { easing: "ease-in" }),
        play(letter!, [{ transform: "none" }, { transform: `translateY(${rise}px)` }], 760),
      ];
      await Promise.all(openAnims.map((animation) => animation.finished));
      if (disposed || state !== "busy") return;
      setState("open");
      if (settle) sync();
    }

    async function closeEnvelope() {
      if (disposed) return;
      setState("busy");
      for (const animation of openAnims) { animation.updatePlaybackRate(1.3); animation.reverse(); }
      await Promise.all(openAnims.map((animation) => animation.finished));
      if (disposed || state !== "busy") return;
      openAnims.forEach((animation) => animation.cancel());
      openAnims = [];
      await tween(0, 650);
      if (disposed) return;
      setState("closed");
      sync();
    }

    async function go() {
      if (disposed || state === "busy" || state === "gone") return;
      if (state === "closed") await openEnvelope(true, false);
      if (disposed) return;
      setState("gone");
      const drop: KeyframeAnimationOptions = { easing: "cubic-bezier(.5,0,.75,.15)" };
      play(pieces.bottom, [{ transform: "none" }, { transform: `translateY(${window.innerHeight}px) rotate(5deg)` }], 760, drop);
      play(under!, [{ transform: "none" }, { transform: `translateY(${window.innerHeight}px) rotate(5deg)` }], 760, drop);
      play(letter!, [{ transform: `translateY(${rise}px)` }, { transform: `translateY(${rise - 16}px) scale(1.04)`, offset: 0.3 }, { transform: `translateY(${rise - 40}px) scale(1.2)`, opacity: 0 }], 760, { easing: "ease-in" });
      if (reduce()) router.push(href);
      else navTimer = setTimeout(() => { if (!disposed) router.push(href); }, NAVIGATE_AFTER_MS);
    }

    const isMouse = (event: Event) => (event as PointerEvent).pointerType === "mouse" && !tapMode();
    const onEnter = (event: Event) => { if (!isMouse(event)) return; hovering = true; sync(); };
    const onLeave = (event: Event) => { if (!isMouse(event)) return; hovering = false; sync(); };
    const onFocusIn = () => { focusInside = true; sync(); };
    const onFocusOut = (event: Event) => {
      const next = (event as FocusEvent).relatedTarget as Node | null;
      if (next && root!.contains(next)) return;
      focusInside = false; sync();
    };
    const onClick = (event: Event) => {
      // Links and buttons inside (the letter's link, the title's translation control) act on their own.
      for (let node = event.target as Node | null; node && node !== root; node = node.parentNode) {
        const tag = (node as Element).tagName;
        if (tag === "A" || tag === "BUTTON") { clearTimeout(clickTimer); clickTimer = undefined; return; }
      }
      if (state === "gone") return;
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = undefined; run(go()); return; }
      clickTimer = setTimeout(() => {
        clickTimer = undefined;
        if (!tapMode()) return; // With a mouse, hover already opens and closes it.
        tapOpen = state === "closed" ? true : state === "open" ? false : !tapOpen;
        sync();
      }, DOUBLE_CLICK_MS);
    };
    const onOutside = (event: Event) => {
      if (!tapMode() || root!.contains(event.target as Node)) return;
      tapOpen = false; sync();
    };

    setState("closed");
    layout();
    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onOutside);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (state !== "gone") layout(); });
    resize?.observe(root);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(clickTimer);
      clearTimeout(navTimer);
      resize?.disconnect();
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onOutside);
      root.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
    };
  }, [campaign.id, href, router]);

  const front = (k: (typeof PIECES)[number]) => (
    <div ref={partRef(`${k}:art`)} className="mw-envelope__art" data-slot={k === "bottom" ? "campaign-envelope-front" : undefined}>
      <div className="mw-envelope__bg" />
      <div className="mw-envelope__from"><span className="block">{t("ui.promotionCampaigns.envelopeFrom")}</span><span className="block">{t("ui.promotionCampaigns.envelopeTo")}</span></div>
      <div className="mw-envelope__strip" aria-hidden="true">
        <span className="mw-envelope__tab"><ArrowRight size={16} /></span>
        {Array.from({ length: 9 }, (_, index) => <span key={index}>{t("ui.promotionCampaigns.pullToOpen")} ✂</span>)}
      </div>
      <div className="mw-envelope__body">
        <span className="mw-envelope__eyebrow">{t("ui.promotionCampaigns.invitedTo")}</span>
        {k === "bottom"
          ? <h2 id={titleId} className="mw-envelope__title"><LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} /></h2>
          : <p className="mw-envelope__title"><LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title}>{({ text }) => text}</LocalizedContent></p>}
        <p className="mw-envelope__row"><CalendarDays size={18} aria-hidden="true" /><span>{startLabel}{" – "}{endLabel}</span></p>
        {placeNames.length > 0 && (
          <p className="mw-envelope__row">
            <MapPin size={18} aria-hidden="true" />
            <span>{placeNames.slice(0, 3).join(" · ")}{placeNames.length > 3 && <>{" "}{t("ui.promotionCampaigns.moreLocations", { count: placeNames.length - 3 })}</>}</span>
          </p>
        )}
        <span className="mw-envelope__hint">
          <Mail size={15} aria-hidden="true" />
          <span className="mw-envelope__hint-hover">{t("ui.promotionCampaigns.envelopeHintHover")}</span>
          <span className="mw-envelope__hint-tap">{t("ui.promotionCampaigns.envelopeHintTap")}</span>
        </span>
      </div>
      <div className="mw-envelope__stamp" aria-hidden="true">
        <div className="mw-envelope__stamp-img">{image && <Image src={image} alt="" fill sizes="132px" unoptimized={unoptimized} className="object-cover" />}</div>
        <span className="mw-envelope__stamp-caption">{new Date(campaign.startsAt).getUTCFullYear()}</span>
      </div>
      {firstLocation && (
        <div className="mw-envelope__postmark" aria-hidden="true">
          <span>{firstLocation.name}</span>
          <span>{formatEventDate(firstLocation.startsOn, locale)}</span>
        </div>
      )}
    </div>
  );

  const moreLocations = (shown: number, className: string) => campaign.locations.length > shown && (
    <p className={`${className} mb-2 text-xs font-semibold text-muted-foreground`}>{t("ui.promotionCampaigns.moreLocations", { count: campaign.locations.length - shown })}</p>
  );

  return (
    <article ref={rootRef} className="mw-envelope" data-state="closed" aria-labelledby={titleId}>
      <div ref={underRef} className="mw-envelope__under" aria-hidden="true" />
      <div className="mw-envelope__pocket">
        <div ref={letterRef} data-slot="campaign-envelope-letter" className="mw-envelope__letter bg-card text-foreground">
          <div className="mw-envelope__lhead">
            {image && <Image src={image} alt="" fill sizes="(max-width: 767px) 100vw, 1200px" loading={imagePriority ? "eager" : "lazy"} unoptimized={unoptimized} className="object-cover" />}
            <div className="mw-envelope__band">
              <span>{t(getEventOperationalLabelKey(campaign))}</span>
              {campaign.vendors.length > 0 && <><i aria-hidden="true">✦</i><span>{t("ui.promotionCampaigns.stallsJoining", { count: campaign.vendors.length })}</span></>}
              {campaign.locations.length > 0 && <><i aria-hidden="true">✦</i><span>{t("ui.promotionCampaigns.locationCount", { count: campaign.locations.length })}</span></>}
            </div>
          </div>
          <div className="mw-envelope__lbody">
            {(session || campaign.vendors.length > 0) && (
              <div className="min-w-0">
                <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("ui.promotionCampaigns.insideEvent")}</p>
                {session && (
                  <div className="mb-2 flex items-center gap-3 rounded-[14px] bg-secondary/40 px-3 py-2.5">
                    <span aria-hidden="true" className={`mx-1 h-2.5 w-2.5 shrink-0 rounded-full ${session.openNow ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-amber-500"}`} />
                    <span className="min-w-0">
                      <b className="block text-sm">{session.openNow
                        ? t("ui.promotionCampaigns.openNowSession", { hours: formatEventHours(session.location.opensAt, session.location.closesAt, locale) })
                        : t("ui.promotionCampaigns.nextSession", { date: formatEventDate(session.date, locale), hours: formatEventHours(session.location.opensAt, session.location.closesAt, locale) })}</b>
                      <small className="block truncate text-xs text-muted-foreground">{session.location.name}</small>
                    </span>
                  </div>
                )}
                {campaign.vendors.length > 0 && (
                  <div className="flex items-center gap-3 rounded-[14px] bg-secondary/40 px-3 py-2.5">
                    <span className="flex shrink-0 pl-2" aria-hidden="true">
                      {campaign.vendors.slice(0, 4).map((vendor) => (
                        <span key={vendor.vendorId} className="relative -ml-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-[9px] border-2 border-card bg-primary text-[10px] font-bold text-primary-foreground">
                          {vendor.vendorLogoUrl
                            ? <Image src={vendor.vendorLogoUrl} alt="" fill sizes="28px" unoptimized={vendor.vendorLogoUrl.startsWith("http://") || vendor.vendorLogoUrl.startsWith("https://")} className="object-cover" />
                            : initials(vendor.vendorName)}
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0">
                      <b className="block text-sm">{t("ui.promotionCampaigns.stallsJoining", { count: campaign.vendors.length })}</b>
                      <small className="block truncate text-xs text-muted-foreground">{campaign.vendors.slice(0, 3).map((vendor) => vendor.vendorName).join(", ")}</small>
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0">
              {campaign.locations.length > 0 && <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-primary">{t("ui.promotionCampaigns.locationsSection", { count: campaign.locations.length })}</p>}
              {campaign.locations.slice(0, 3).map((location) => (
                <div key={location.id} className="mw-envelope__loc mb-1 border-l-[3px] border-primary py-1.5 pl-3.5">
                  <b className="block truncate text-sm">{location.name}</b>
                  <small className="block text-xs text-muted-foreground">{formatEventDateRange(location.startsOn, location.endsOn, locale)} · {formatEventHours(location.opensAt, location.closesAt, locale)}</small>
                </div>
              ))}
              {moreLocations(3, "mw-envelope__more-wide")}
              {moreLocations(1, "mw-envelope__more-narrow")}
              <Button asChild className="mt-2 min-h-11 rounded-full px-5">
                <Link href={href}>{t("ui.promotionCampaigns.viewCampaign")} <ArrowUpRight size={16} aria-hidden="true" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
      {PIECES.map((k) => (
        <div key={k} ref={partRef(`${k}:pc`)} className="mw-envelope__pc" data-k={k} aria-hidden={k === "bottom" ? undefined : true}>
          <div ref={partRef(`${k}:fold`)} className="mw-envelope__fold">
            <div className="mw-envelope__artwrap">{front(k)}</div>
            <div ref={partRef(`${k}:shade`)} className="mw-envelope__shade" />
          </div>
          <svg ref={partRef(`${k}:svg`)} className="mw-envelope__roll" aria-hidden="true" style={{ display: "none" }}>
            <defs><linearGradient ref={partRef(`${k}:gradient`)} id={`${gradientId}-${k}`} gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#b9b09c" /><stop offset=".35" stopColor="#fffdf6" /><stop offset=".7" stopColor="#f1ebdc" /><stop offset="1" stopColor="#a99f8a" stopOpacity=".9" /></linearGradient></defs>
            <polygon ref={partRef(`${k}:roll`)} fill={`url(#${gradientId}-${k})`} />
          </svg>
        </div>
      ))}
      <div ref={bitsRef} className="mw-envelope__bits" aria-hidden="true" />
    </article>
  );
}
