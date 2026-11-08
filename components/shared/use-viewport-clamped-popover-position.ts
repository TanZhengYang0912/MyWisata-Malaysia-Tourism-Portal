"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

type TriggerRect = Pick<DOMRectReadOnly, "left" | "bottom" | "width">;
type PanelRect = Pick<DOMRectReadOnly, "width">;
type ViewportSize = { width: number; height: number };
type ViewportPopoverPosition = Pick<CSSProperties, "position" | "left" | "top" | "maxHeight">;

const VIEWPORT_GUTTER = 8;
const TRIGGER_OFFSET = 12;

export function calculateViewportClampedPopoverPosition(
  trigger: TriggerRect,
  panel: PanelRect,
  viewport: ViewportSize,
): ViewportPopoverPosition {
  const availableWidth = Math.max(0, viewport.width - VIEWPORT_GUTTER * 2);
  const panelWidth = Math.min(panel.width, availableWidth);
  const centeredLeft = trigger.left + trigger.width / 2 - panelWidth / 2;
  const maxLeft = Math.max(VIEWPORT_GUTTER, viewport.width - panelWidth - VIEWPORT_GUTTER);
  const left = Math.min(Math.max(centeredLeft, VIEWPORT_GUTTER), maxLeft);
  const top = trigger.bottom + TRIGGER_OFFSET;

  return {
    position: "fixed",
    left,
    top,
    maxHeight: Math.max(0, viewport.height - top - VIEWPORT_GUTTER),
  };
}

export function useViewportClampedPopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): ViewportPopoverPosition | null {
  const [position, setPosition] = useState<ViewportPopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      // Reset before the next open so a previous viewport position cannot flash.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      setPosition(calculateViewportClampedPopoverPosition(
        trigger.getBoundingClientRect(),
        panel.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };

    // The panel is mounted by this render; measure it before paint to avoid an
    // off-screen frame when opening at a narrow viewport.
    updatePosition();

    let frame: number | null = null;
    const schedulePositionUpdate = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updatePosition();
      });
    };

    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
    };
  }, [open, panelRef, triggerRef]);

  return open ? position : null;
}
