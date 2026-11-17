"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedContent } from "@/components/customer/localized-content";
import { buildZipStrip, createEnvelopeGeometry, splitOpenLayout, toPolygon, type EnvelopeGeometry, type EnvelopeState } from "@/lib/customer/envelope-tear";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { isOptimizableImageUrl } from "@/lib/storage/optimizable-image";

const PIECES = ["bottom", "top"] as const;
/** One stamp per carousel position, cycling. */
const STAMPS = ["hibiscus", "tiger", "stall"] as const;
/** Postal legend on the postmark ring: the same in every locale, like a real cancellation. */
const POSTAL_COUNTRY = "MALAYSIA";
/** Let go past this share of the travel and the envelope opens; the tab shows a tick. */
const OPEN_AT = 0.76;
/** A press that moves no further than this before release is a tap, which opens the envelope. */
const TAP_SLOP_PX = 6;
const SPRING_BACK_MS = 210;
const FINISH_TEAR_MS = 180;
const SPLIT_MS = 230;

/** "Main – Subtitle" splits at its first spaced dash; "Pop-up" (no spaces) stays whole. */
function splitEnvelopeTitle(text: string): [string, string | null] {
  const match = /\s+[-–—]\s+/.exec(text);
  if (!match) return [text, null];
  const main = text.slice(0, match.index).trim(), sub = text.slice(match.index + match[0].length).trim();
  return main && sub ? [main, sub] : [text, null];
}

/**
 * The home spotlight's campaign card: an airmail envelope with a tear strip.
 * Drag the tab along the strip to tear it open; past the threshold (or on a tap,
 * Enter or Space) the halves part, the letter comes out, and it goes to the event page.
 */
export function CampaignEnvelope({ campaign, imagePriority = false, position = 0 }: { campaign: PromotionCampaignPublic; imagePriority?: boolean; position?: number }) {
  const { t, i18n } = useTranslation("customer");
  const router = useRouter();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const href = `/customer/events/${encodeURIComponent(campaign.slug)}`;
  const svgId = useId();
  const inkId = `${svgId}-ink`;
  const titleId = `campaign-envelope-${campaign.id}-title`;
  const stamp = STAMPS[Math.abs(Math.trunc(position)) % STAMPS.length];

  const rootRef = useRef<HTMLElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const letterRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const altRef = useRef<HTMLAnchorElement>(null);
  // Each piece's parts, keyed "<piece>:<part>" (pc, fold, art).
  const partRefs = useRef<Record<string, Element | null>>({});
  const partRef = (key: string) => (el: Element | null) => { partRefs.current[key] = el; };

  const isFullDayCampaign = isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt);
  const formatCampaignDate = (value: string) => formatDate(value, locale, { timeZone: "Asia/Kuala_Lumpur" });
  const formatCampaignTime = (value: string) => new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(value));
  const isDemoCampaign = campaign.slug.startsWith("demo-");
  const campaignTitle = isDemoCampaign ? campaign.title.replace(/^Demo\s*[-–—]\s*/i, "") : campaign.title;
  const placeNames = [...new Set(campaign.locations.map((location) => location.name))];
  const image = campaign.posterUrl;
  const unoptimized = !isOptimizableImageUrl(image);

  useEffect(() => {
    const root = rootRef.current, under = underRef.current, letter = letterRef.current, grip = gripRef.current, alt = altRef.current;
    const part = <T extends Element>(k: string, name: string) => partRefs.current[`${k}:${name}`] as T | null | undefined;
    const captureParts = (k: (typeof PIECES)[number]) => {
      const pc = part<HTMLElement>(k, "pc"), fold = part<HTMLElement>(k, "fold"), art = part<HTMLElement>(k, "art");
      return pc && fold && art ? { pc, fold, art } : null;
    };
    const bottom = captureParts("bottom"), top = captureParts("top");
    if (!root || !under || !letter || !grip || !alt || !bottom || !top) return;
    // Callback refs can be cleared on re-render or unmount; one effect owns one complete snapshot.
    const parts = { bottom, top };
    const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let geo: EnvelopeGeometry, progress = 0, state: EnvelopeState = "closed", raf = 0, distance = 1;
    let disposed = false, active: { id: number; x: number } | null = null, dragged = false;
    const setState = (next: EnvelopeState) => { state = next; root.setAttribute("data-state", next); };

    function draw(value: number) {
      if (disposed) return;
      progress = Math.max(0, Math.min(1, value));
      // Reduced motion: only the tab follows the pointer; the strip tears in one step when it opens.
      const tear = reduce() && progress < 1 ? 0 : progress;
      for (const { k, outer, inner } of buildZipStrip(tear, geo)) {
        const { fold, art } = parts[k];
        fold.style.clipPath = toPolygon(outer);
        art.style.clipPath = toPolygon(inner);
      }
      placeGrip();
    }

    /** The tab rides the tear front and swaps its arrow for a tick once ready. */
    function placeGrip() {
      grip!.style.setProperty("--drag", `${progress * distance}px`);
      const ready = String(progress >= OPEN_AT);
      if (root!.getAttribute("data-ready") !== ready) root!.setAttribute("data-ready", ready);
    }

    function layout() {
      if (disposed) return;
      const width = root!.clientWidth || 0, narrow = width < 640;
      geo = createEnvelopeGeometry(width, narrow);
      // The 44px tab starts 4px in from the strip's overhang and travels to the card's right edge.
      distance = Math.max(1, width - 44 + geo.ovh - 4);
      root!.setAttribute("data-narrow", String(narrow));
      for (const [name, value] of Object.entries({ h0: geo.H, a: geo.a, sh: geo.sh, ovh: geo.ovh })) root!.style.setProperty(`--${name}`, `${value}px`);
      root!.style.height = `${geo.H}px`;
      if (state === "closed" || state === "drag") Object.assign(letter!.style, restingLetter());
      draw(progress);
    }

    /** The closed letter sits centred on the strip and shows only the band the strip uncovers. */
    function restingLetter() {
      const height = letter!.offsetHeight || 0, rest = geo.a + geo.sh / 2 - height / 2;
      return { transform: `translateY(${rest}px)`, clipPath: `inset(${geo.a - rest}px 0px ${height - (geo.a + geo.sh - rest)}px 0px round 16px)` };
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
    const play = (el: Element, frames: Keyframe[]) =>
      el.animate(frames, { duration: reduce() ? 1 : SPLIT_MS, fill: "forwards", easing: "cubic-bezier(.22,.8,.35,1)" });

    // Cancelled animations reject `finished`; an unmount mid-animation must not surface that.
    const run = (task: Promise<void>) => { task.catch(() => {}); };

    /** Completes the tear, parts the halves round the letter, then goes to the event page. Runs once. */
    async function finishTear() {
      if (disposed || (state !== "closed" && state !== "drag")) return;
      setState("busy");
      await tween(1, FINISH_TEAR_MS);
      if (disposed) return;
      const headerBottom = parseFloat(window.getComputedStyle?.(document.documentElement)?.getPropertyValue?.("--customer-header-h") ?? "") || 0;
      const rest = restingLetter();
      const split = splitOpenLayout({ tearTop: geo.a, tearBottom: geo.a + geo.sh, letterHeight: letter!.offsetHeight || 0, cardTop: root!.getBoundingClientRect?.().top ?? 0, headerBottom, viewportHeight: window.innerHeight });
      const animations = [
        play(parts.top.pc, [{ transform: "none" }, { transform: `translateY(${split.topShift}px)` }]),
        play(parts.bottom.pc, [{ transform: "none" }, { transform: `translateY(${split.bottomShift}px)` }]),
        play(under!, [{ opacity: 1 }, { opacity: 0 }]),
        // The negative inset keeps the letter's shadow once it is fully out.
        play(letter!, [rest, { transform: `translateY(${split.letterTop}px)`, clipPath: "inset(-48px -48px -48px -48px round 16px)" }]),
      ];
      await Promise.all(animations.map((animation) => animation.finished));
      if (disposed) return;
      setState("gone");
      router.push(href);
    }

    const onDown = (event: Event) => {
      const e = event as PointerEvent;
      if (state !== "closed" || !e.isPrimary || e.button !== 0) return;
      active = { id: e.pointerId, x: e.clientX };
      dragged = false;
      setState("drag");
      grip.setPointerCapture?.(e.pointerId);
      // Focus pauses the carousel's autoplay (featured-recommendations-frame) for the whole drag.
      grip.focus({ preventScroll: true });
    };
    const onMove = (event: Event) => {
      const e = event as PointerEvent;
      if (!active || active.id !== e.pointerId) return;
      const dx = e.clientX - active.x;
      if (Math.abs(dx) > TAP_SLOP_PX) dragged = true;
      draw(dx / distance);
    };
    const endDrag = (event: Event) => {
      const e = event as PointerEvent;
      if (!active || active.id !== e.pointerId) return;
      const start = active;
      active = null;
      const released = e.type === "pointerup";
      if (released && Math.abs(e.clientX - start.x) > TAP_SLOP_PX) dragged = true;
      // A tap (or a cancel before any real movement): settle at once; the click that follows a tap opens it.
      if (!dragged) { draw(0); setState("closed"); return; }
      if (released) {
        draw((e.clientX - start.x) / distance);
        if (progress >= OPEN_AT) { run(finishTear()); return; }
      }
      setState("returning");
      run(tween(0, SPRING_BACK_MS).then(() => { if (state === "returning") setState("closed"); }));
    };
    const onGripClick = (event: Event) => {
      // The click a browser sends after a real drag must not open it. Keyboard clicks (detail 0) always do:
      // a `dragged` left over from a cancelled drag never blocks them, and every pointer click follows a pointerdown that resets it.
      if ((event as MouseEvent).detail !== 0 && dragged) return;
      run(finishTear());
    };
    const onAltClick = (event: Event) => {
      const e = event as MouseEvent;
      // Modifier and non-primary clicks keep the browser default (new tab or window) with no animation.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Native listener on the anchor: it runs before next/link's handler, which skips prevented clicks.
      e.preventDefault();
      run(finishTear());
    };
    const gripListeners: [string, (event: Event) => void][] = [
      ["pointerdown", onDown], ["pointermove", onMove], ["pointerup", endDrag], ["pointercancel", endDrag], ["lostpointercapture", endDrag], ["click", onGripClick],
    ];

    setState("closed");
    layout();
    for (const [type, listener] of gripListeners) grip.addEventListener(type, listener);
    alt.addEventListener("click", onAltClick);
    // Re-measure only while closed: resizing mid-drag would make the tab jump.
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { if (state === "closed") layout(); });
    resize?.observe(root);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize?.disconnect();
      for (const [type, listener] of gripListeners) grip.removeEventListener(type, listener);
      alt.removeEventListener("click", onAltClick);
      if (active && grip.hasPointerCapture?.(active.id)) grip.releasePointerCapture(active.id);
      root.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
    };
  }, [campaign.id, href, router]);

  /** Renders the title (translated when available) through `render`, so every copy splits the text it shows. */
  const localizedTitle = (render: (text: string, control: ReactNode) => ReactNode) => isDemoCampaign
    ? render(campaignTitle, null)
    : <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title}>{({ text, control }) => render(text, control)}</LocalizedContent>;

  const head = (k: (typeof PIECES)[number]) => localizedTitle((text, control) => {
    const [main, sub] = splitEnvelopeTitle(text);
    const titleContent = <><span className="mw-envelope__main">{main}</span>{sub && <span className="mw-envelope__subtitle">{sub}</span>}</>;
    return (
      <div className="mw-envelope__head" aria-hidden={k === "top" ? undefined : true}>
        {/* The translation control sits at the end of the one-line eyebrow, so it never adds height to the title. */}
        <span className="mw-envelope__eyebrow">{t("ui.promotionCampaigns.invitedTo")}{k === "top" && control}</span>
        {k === "top"
          ? <h2 id={titleId} className="mw-envelope__title" data-sub={sub ? "true" : undefined}>{titleContent}</h2>
          : <p className="mw-envelope__title" data-sub={sub ? "true" : undefined}>{titleContent}</p>}
      </div>
    );
  });

  const front = (k: (typeof PIECES)[number]) => (
    <div ref={partRef(`${k}:art`)} className="mw-envelope__art" data-slot={k === "bottom" ? "campaign-envelope-front" : undefined}>
      <div className="mw-envelope__bg" />
      {/* Assistive tech reads From/To and the title from the top half, the dates and place from the bottom half. */}
      <div className="mw-envelope__from" aria-hidden={k === "top" ? undefined : true}><span>{t("ui.promotionCampaigns.envelopeFrom")}</span><span>{t("ui.promotionCampaigns.envelopeTo")}</span></div>
      <div className="mw-envelope__strip" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <span key={index}>{t("ui.promotionCampaigns.pullToOpen")} ✂</span>)}
      </div>
      {head(k)}
      <div className="mw-envelope__body" data-slot={k === "bottom" ? "promotion-campaign-content" : undefined} aria-hidden={k === "bottom" ? undefined : true}>
        <div className="mw-envelope__meta">
          <small>{t("ui.promotionCampaigns.envelopeStarts")}</small>
          <b>{formatCampaignDate(campaign.startsAt)}{!isFullDayCampaign && <span className="t">{formatCampaignTime(campaign.startsAt)}</span>}</b>
        </div>
        <div className="mw-envelope__meta">
          <small>{t("ui.promotionCampaigns.envelopeEnds")}</small>
          <b>{formatCampaignDate(campaign.endsAt)}{!isFullDayCampaign && <span className="t">{formatCampaignTime(campaign.endsAt)}</span>}</b>
        </div>
        {placeNames.length > 0 && (
          <div className="mw-envelope__meta where">
            <small>{t("ui.labels.location")}</small>
            <b>{placeNames[0]}{placeNames.length > 1 && <>{" "}{t("ui.promotionCampaigns.moreLocations", { count: placeNames.length - 1 })}</>}</b>
          </div>
        )}
      </div>
      {/* Printed stamp text (caption, country, Jawi, value) comes from CSS per data-stamp. */}
      <div className="mw-envelope__stampwrap" aria-hidden="true">
        <div className="mw-envelope__stamp">
          <div className="mw-envelope__stamp-pic" />
          <div className="mw-envelope__stamp-foot">
            <span className="mw-envelope__stamp-cap" />
            <span className="mw-envelope__stamp-country"><span className="mw-envelope__stamp-jawi" lang="ms-Arab" /></span>
            <span className="mw-envelope__stamp-value"><small className="vp" /><span className="vn" /><small className="vs" /></span>
          </div>
        </div>
      </div>
      <div className="mw-envelope__postmark" aria-hidden="true">
        <svg viewBox="0 0 140 140" fill="none" stroke="currentColor" style={{ filter: `url(#${inkId})` }}>
          <circle cx="70" cy="70" r="65" strokeWidth="3.6" />
          <circle cx="70" cy="70" r="44" strokeWidth="1.8" />
          <circle cx="70" cy="70" r="40.5" strokeWidth="1" />
          <path id={`${svgId}-${k}-top`} d="M21.5 70A48.5 48.5 0 0 1 118.5 70" stroke="none" />
          <path id={`${svgId}-${k}-bot`} d="M10.5 70A59.5 59.5 0 0 0 129.5 70" stroke="none" />
          <g fill="currentColor" stroke="none" textAnchor="middle">
            <text><textPath href={`#${svgId}-${k}-top`} startOffset="50%">{POSTAL_COUNTRY}</textPath></text>
            <text><textPath href={`#${svgId}-${k}-bot`} startOffset="50%">{POSTAL_COUNTRY}</textPath></text>
            <path d="M70.0 31.5L71.0 39.5L75.4 32.7L72.9 40.4L79.8 36.2L74.1 42.0L82.2 41.2L74.6 44.0L82.2 46.8L74.1 46.0L79.8 51.8L72.9 47.6L75.4 55.3L71.0 48.5L70.0 56.5L69.0 48.5L64.6 55.3L67.1 47.6L60.2 51.8L65.9 46.0L57.8 46.8L65.4 44.0L57.8 41.2L65.9 42.0L60.2 36.2L67.1 40.4L64.6 32.7L69.0 39.5Z" />
            <path d="M11.0 58.4L12.9 59.6L15.9 60.4L18.3 62.0L20.3 65.1L22.7 65.9L24.7 65.1L26.7 62.4L28.6 62.8L30.6 64.7L33.8 67.5L35.0 69.5L37.4 73.1L37.4 76.7L37.2 80.2L36.6 83.0L37.4 87.4L39.4 90.6L41.0 93.0L43.0 96.1L44.0 99.3L42.2 100.7L39.8 100.3L37.8 101.6L36.2 100.1L33.4 97.7L30.6 95.9L27.9 94.2L24.7 91.8L21.9 89.8L20.3 87.8L18.7 84.6L16.7 81.0L15.1 78.3L14.3 74.7L13.1 71.9L12.7 68.3L12.7 64.7L12.0 61.6Z" />
            <path d="M52.5 95.1L54.9 97.7L58.1 98.1L62.4 98.1L65.6 95.0L66.0 89.8L69.2 89.0L74.4 87.8L79.5 86.2L83.9 81.0L87.1 76.3L90.3 74.7L95.0 72.3L97.4 69.5L99.8 67.1L103.4 64.0L107.0 60.0L109.3 56.0L111.3 57.6L113.3 58.8L116.5 60.8L119.7 64.3L124.4 67.1L129.0 70.5L123.7 72.7L121.3 72.3L124.0 76.3L120.5 77.5L118.1 77.9L115.7 78.5L110.1 77.1L103.8 77.1L101.8 79.1L99.8 83.8L96.6 89.4L93.4 93.4L91.9 98.9L87.1 100.1L82.3 101.7L77.5 99.3L72.8 100.5L69.6 103.7L64.8 103.3L60.1 104.5L55.3 102.1L52.5 97.7Z" />
          </g>
        </svg>
      </div>
    </div>
  );

  return (
    <article ref={rootRef} className="mw-envelope" data-state="closed" data-stamp={stamp} aria-labelledby={titleId}>
      {/* Rubber-stamp ink for the postmark: slightly wobbly lines with patches where the ink did not take. */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <filter id={inkId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={1.8} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves={2} seed={8} result="p" />
          <feColorMatrix in="p" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3 0 0 0 2.6" result="holes" />
          <feComposite in="d" in2="holes" operator="in" />
        </filter>
      </svg>
      <div ref={underRef} className="mw-envelope__under" aria-hidden="true" />
      <div className="mw-envelope__pocket" aria-hidden="true">
        <div ref={letterRef} data-slot="campaign-envelope-letter" className="mw-envelope__letter bg-card text-foreground">
          <div className={image ? "mw-envelope__lphoto" : "mw-envelope__lphoto bg-secondary"}>
            {image
              ? <Image src={image} alt="" fill sizes="(max-width: 767px) 100vw, 1200px" loading={imagePriority ? "eager" : "lazy"} unoptimized={unoptimized} className="object-cover" />
              : <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/50"><CalendarDays size={56} strokeWidth={1} /></span>}
          </div>
          <p className="mw-envelope__ltitle text-primary">{localizedTitle((text) => splitEnvelopeTitle(text)[0])}</p>
        </div>
      </div>
      {PIECES.map((k) => (
        <div key={k} ref={partRef(`${k}:pc`)} className="mw-envelope__pc" data-k={k}>
          <div ref={partRef(`${k}:fold`)} className="mw-envelope__fold">
            <div className="mw-envelope__artwrap">{front(k)}</div>
          </div>
        </div>
      ))}
      <span className="mw-envelope__guide" aria-hidden="true">{t("ui.promotionCampaigns.releaseToOpen")}</span>
      <button ref={gripRef} type="button" className="mw-envelope__grip" aria-label={t("ui.promotionCampaigns.pullToOpen")} aria-describedby={titleId}>
        <ArrowRight className="mw-envelope__grip-go" aria-hidden="true" />
        <Check className="mw-envelope__grip-ok" aria-hidden="true" />
      </button>
      <Link ref={altRef} href={href} className="mw-envelope__alt sr-only focus-visible:not-sr-only" aria-describedby={titleId}>{t("ui.promotionCampaigns.openWithoutDragging")}</Link>
    </article>
  );
}
