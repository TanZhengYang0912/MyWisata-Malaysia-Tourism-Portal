"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideWheelTurn,
  INITIAL_WHEEL_TURN_STATE,
} from "@/lib/customer/wheel-page-turn";
import { limitSwipeToOnePage } from "@/lib/customer/touch-page-turn";
import { railPagePosition } from "@/lib/customer/rail-pages";

// A touch swipe counts as finished once the rail has stopped scrolling for this long (momentum included).
const TOUCH_SETTLE_MS = 140;

type PagerState = {
  page: number;
  pageCount: number;
  progress: number;
};

const INITIAL_PAGER_STATE: PagerState = { page: 0, pageCount: 1, progress: 0 };

// The rail's trailing padding makes one page of cards exactly one viewport wide, so the page step is clientWidth.
function railPosition(viewport: HTMLElement) {
  return railPagePosition({
    scrollLeft: viewport.scrollLeft,
    pageStep: viewport.clientWidth,
    scrollWidth: viewport.scrollWidth,
    clientWidth: viewport.clientWidth,
  });
}

export function useHomeDestinationPager(viewportRef: React.RefObject<HTMLElement | null>) {
  const [pager, setPager] = useState<PagerState>(INITIAL_PAGER_STATE);
  const metricsRef = useRef({ pageStep: 0, pageCount: 1 });
  const wheelTurnRef = useRef(INITIAL_WHEEL_TURN_STATE);
  const pendingPageRef = useRef<number | null>(null);
  const pendingPageTimerRef = useRef<number | null>(null);
  // Page the finger started on, kept until that swipe's scroll settles; null when no touch swipe is in progress.
  const touchStartPageRef = useRef<number | null>(null);
  const touchingRef = useRef(false);
  const touchScrolledRef = useRef(false);
  const touchSettleTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const sync = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;

    const pageStep = viewport.clientWidth;
    const { pageCount, progress, page } = railPosition(viewport);
    metricsRef.current = { pageStep, pageCount };

    setPager((previous) => (
      previous.page === page && previous.pageCount === pageCount && previous.progress === progress
        ? previous
        : { page, pageCount, progress }
    ));
  }, [viewportRef]);

  const goToPage = useCallback((requestedPage: number) => {
    const viewport = viewportRef.current;
    const { pageStep, pageCount } = metricsRef.current;
    if (!viewport || pageStep === 0) return;

    const page = Math.min(Math.max(requestedPage, 0), pageCount - 1);
    touchStartPageRef.current = null;
    pendingPageRef.current = page;
    if (pendingPageTimerRef.current !== null) window.clearTimeout(pendingPageTimerRef.current);
    pendingPageTimerRef.current = window.setTimeout(() => {
      pendingPageRef.current = null;
      pendingPageTimerRef.current = null;
    }, 350);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ left: page * pageStep, behavior: reducedMotion ? "auto" : "smooth" });
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const currentPage = () => railPosition(viewport).page;
    const settleTouchSwipe = () => {
      touchSettleTimerRef.current = null;
      const startPage = touchStartPageRef.current;
      const { pageStep, pageCount } = metricsRef.current;
      if (touchingRef.current || startPage === null || pageStep === 0) return;
      touchStartPageRef.current = null;
      const settledPage = currentPage();
      const limitedPage = limitSwipeToOnePage({ startPage, settledPage, pageCount });
      if (limitedPage !== settledPage) goToPage(limitedPage);
    };
    const scheduleTouchSettle = () => {
      if (touchSettleTimerRef.current !== null) window.clearTimeout(touchSettleTimerRef.current);
      touchSettleTimerRef.current = window.setTimeout(settleTouchSwipe, TOUCH_SETTLE_MS);
    };
    const scheduleSync = () => {
      if (touchStartPageRef.current !== null) {
        touchScrolledRef.current = true;
        if (!touchingRef.current) scheduleTouchSettle();
      }
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        sync();
      });
    };
    const onWheel = (event: WheelEvent) => {
      const result = decideWheelTurn(wheelTurnRef.current, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        now: performance.now(),
      });
      wheelTurnRef.current = result.state;
      if (result.turn === 0) return;

      const startPage = pendingPageRef.current ?? currentPage();
      const targetPage = Math.min(Math.max(startPage + result.turn, 0), metricsRef.current.pageCount - 1);
      if (targetPage === startPage) return;

      event.preventDefault();
      goToPage(targetPage);
    };
    // Touch swipes scroll natively (the rail follows the finger); the browser's scroll-snap-stop normally stops on the
    // next page, and settleTouchSwipe pulls back any fling that still went further than one page.
    const onTouchStart = () => {
      const { pageStep } = metricsRef.current;
      if (pageStep === 0) return;
      touchingRef.current = true;
      touchScrolledRef.current = false;
      touchStartPageRef.current = pendingPageRef.current ?? currentPage();
      if (touchSettleTimerRef.current !== null) window.clearTimeout(touchSettleTimerRef.current);
    };
    const onTouchEnd = () => {
      touchingRef.current = false;
      // A tap that never scrolled leaves nothing to settle.
      if (!touchScrolledRef.current) touchStartPageRef.current = null;
      else scheduleTouchSettle();
    };
    const observer = new ResizeObserver(sync);

    sync();
    observer.observe(viewport);
    viewport.addEventListener("scroll", scheduleSync, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", scheduleSync);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (pendingPageTimerRef.current !== null) window.clearTimeout(pendingPageTimerRef.current);
      if (touchSettleTimerRef.current !== null) window.clearTimeout(touchSettleTimerRef.current);
    };
  }, [goToPage, sync, viewportRef]);

  return { ...pager, goToPage };
}
