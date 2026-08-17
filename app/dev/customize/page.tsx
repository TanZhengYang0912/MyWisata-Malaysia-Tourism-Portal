"use client";

// DEV ONLY: prototype sandbox for the iPhone-widget-style vendor page builder.
// Standalone, mock content, localStorage only — NOT wired to any real outlet
// page. It's the "test the feel first" step before this layout model replaces
// the current vertical-stack Outlet Studio. Deleted at merge (same convention as
// app/dev/listings).
//
// Model: a fixed COLS×ROWS cell grid; each widget occupies a rect (x,y,w,h) and
// can be placed anywhere it fits (in-bounds, no overlap) — not a reflow list.
// Each of the 10 widget types can appear at most once. See grid.ts for the
// placement math and widgets.tsx for the per-type editable bodies.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Maximize2, Plus, X } from "lucide-react";
import { cellFromPointer, fits, firstFreeSlot, type Rect } from "./grid";
import { WIDGET_CATALOG, WIDGET_ORDER, WidgetEditor, defaultContent, type WidgetType } from "./widgets";

const COLS = 8;
const ROWS = 10;
const ROW_PX = 92;
const STORAGE_KEY = "mywisata:dev-customize:v2";

const SIZE_PRESETS: [number, number][] = [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 2]];

interface Placed extends Rect {
  id: string;
  type: WidgetType;
  content: unknown;
}

function seedLayout(): Placed[] {
  const seed: [WidgetType, number, number, number, number][] = [
    ["cover", 0, 0, 4, 2],
    ["about", 4, 0, 2, 1],
    ["promo", 4, 1, 2, 1],
    ["hours", 0, 2, 2, 3],
    ["gallery", 2, 2, 3, 2],
    ["products", 5, 2, 3, 2],
    ["announcement", 0, 5, 4, 1],
    ["contact", 4, 4, 2, 2],
    ["reviews", 6, 4, 2, 2],
    ["social", 0, 6, 2, 1],
  ];
  return seed.map(([type, x, y, w, h]) => ({ id: `seed-${type}`, type, x, y, w, h, content: defaultContent(type) }));
}

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `w-${idCounter}`;
}

export default function DevCustomizePage() {
  const { t } = useTranslation("auth");
  const [widgets, setWidgets] = useState<Placed[]>(() => seedLayout());
  const [mounted, setMounted] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; ok: boolean } | null>(null);
  const [sizeMenuId, setSizeMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setWidgets(JSON.parse(raw) as Placed[]);
    } catch {
      // corrupt/unavailable — keep the seed layout
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch {
      // storage full/unavailable — layout just won't persist
    }
  }, [mounted, widgets]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const placedTypes = new Set(widgets.map((w) => w.type));

  function widgetLabel(type: WidgetType) {
    return t(`dev.customize.widgetLabels.${type}`);
  }

  function addWidget(type: WidgetType) {
    const [w, h] = WIDGET_CATALOG[type].defaultSize;
    const slot = firstFreeSlot(widgets, w, h, COLS, ROWS);
    if (!slot) {
      setNotice(t("dev.customize.noRoom", { widget: widgetLabel(type) }));
      return;
    }
    setWidgets((cur) => [...cur, { id: newId(), type, x: slot.x, y: slot.y, w, h, content: defaultContent(type) }]);
  }
  function removeWidget(id: string) {
    setWidgets((cur) => cur.filter((x) => x.id !== id));
  }
  function updateContent(id: string, content: unknown) {
    setWidgets((cur) => cur.map((x) => (x.id === id ? { ...x, content } : x)));
  }
  function resizeWidget(id: string, w: number, h: number) {
    setWidgets((cur) => cur.map((x) => (x.id === id ? { ...x, w, h } : x)));
    setSizeMenuId(null);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!dragId || !gridRef.current) return;
    e.preventDefault();
    const dragged = widgets.find((w) => w.id === dragId);
    if (!dragged) return;
    const { x, y } = cellFromPointer(gridRef.current, e.clientX, e.clientY, ROW_PX, COLS, ROWS, dragged.w, dragged.h);
    const ok = fits(widgets, { x, y, w: dragged.w, h: dragged.h }, COLS, ROWS, dragId);
    setGhost({ x, y, w: dragged.w, h: dragged.h, ok });
  }
  function handleDrop() {
    if (dragId && ghost?.ok) {
      setWidgets((cur) => cur.map((w) => (w.id === dragId ? { ...w, x: ghost.x, y: ghost.y } : w)));
    }
    setDragId(null);
    setGhost(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-4 rounded-xl border border-dashed border-cta-orange/50 bg-cta-orange/10 px-4 py-2.5 text-[12px] font-semibold text-cta-orange">
        {t("dev.customize.notice")}
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{t("dev.customize.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dev.customize.description")}</p>
        </div>
        <button type="button" onClick={() => setWidgets(seedLayout())} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted">
          {t("dev.customize.reset")}
        </button>
      </div>

      {/* Add-widget palette — each type usable once; placed types are disabled. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {WIDGET_ORDER.map((type) => {
          const { icon: Icon } = WIDGET_CATALOG[type];
          const used = placedTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              disabled={used}
              onClick={() => addWidget(type)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow-sm ${used ? "cursor-not-allowed border-border bg-muted text-muted-foreground/60" : "border-border bg-card text-foreground hover:border-primary hover:text-primary"}`}
            >
              {used ? <Icon size={13} /> : <Plus size={13} />} {!used && <Icon size={13} />} {widgetLabel(type)}
            </button>
          );
        })}
      </div>
      {notice && <p className="mb-3 text-[12px] font-semibold text-destructive">{notice}</p>}

      {/* The grid — visible cell lines, free placement via drag, dashed ghost preview. */}
      <div
        ref={gridRef}
        className="relative rounded-2xl border border-border p-0"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridAutoRows: `${ROW_PX}px`,
          gridTemplateRows: `repeat(${ROWS}, ${ROW_PX}px)`,
          gap: 0,
          backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: `calc(100% / ${COLS}) ${ROW_PX}px`,
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {ghost && (
          <div
            className={`pointer-events-none z-30 m-1 rounded-xl border-2 border-dashed ${ghost.ok ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"}`}
            style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}` }}
          />
        )}

        {widgets.map((widget) => {
          const Icon = WIDGET_CATALOG[widget.type].icon;
          const dragging = dragId === widget.id;
          return (
            <div
              key={widget.id}
              className={`group relative z-10 m-1 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_6px_18px_rgba(1,0,102,0.05)] transition ${dragging ? "opacity-30" : ""}`}
              style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
            >
              <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setSizeMenuId((cur) => (cur === widget.id ? null : widget.id))}
                  className="pointer-events-auto grid h-6 w-6 place-items-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-sm hover:text-primary"
                  aria-label={t("dev.customize.changeSize")}
                >
                  <Maximize2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => removeWidget(widget.id)}
                  className="pointer-events-auto grid h-6 w-6 place-items-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-sm hover:text-destructive"
                  aria-label={t("dev.customize.removeWidget")}
                >
                  <X size={13} />
                </button>
              </div>

              <div
                draggable
                onDragStart={() => setDragId(widget.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setGhost(null);
                }}
                className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary active:cursor-grabbing"
              >
                <GripVertical size={12} className="text-muted-foreground" />
                <Icon size={12} /> {widgetLabel(widget.type)}
              </div>

              {sizeMenuId === widget.id && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setSizeMenuId(null)} />
                  <div className="absolute right-1.5 top-9 z-30 rounded-xl border border-border bg-card p-1.5 shadow-lg">
                    <div className="grid grid-cols-2 gap-1">
                      {SIZE_PRESETS.map(([w, h]) => {
                        const active = widget.w === w && widget.h === h;
                        const possible = active || fits(widgets, { x: widget.x, y: widget.y, w, h }, COLS, ROWS, widget.id);
                        return (
                          <button
                            key={`${w}x${h}`}
                            type="button"
                            disabled={!possible}
                            onClick={() => resizeWidget(widget.id, w, h)}
                            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${active ? "bg-primary text-white" : possible ? "text-foreground hover:bg-muted" : "cursor-not-allowed text-muted-foreground/40"}`}
                          >
                            {w}×{h}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="min-h-0 flex-1 overflow-hidden p-2.5">
                <WidgetEditor type={widget.type} content={widget.content} onChange={(next) => updateContent(widget.id, next)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
