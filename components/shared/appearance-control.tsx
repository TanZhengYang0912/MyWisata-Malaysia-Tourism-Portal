"use client";

// CLAUDE-DARKMODE-A11Y.md — one shared "Appearance" popover (theme +
// text size) mounted in every shell's header/sidebar so both settings live
// in one place platform-wide, per the doc's acceptance criteria. `variant`
// only changes the trigger's chrome to match where it's mounted — the admin
// sidebar is a permanently-dark rail (not itself part of the light/dark
// switch, same as most admin shells), so its trigger uses the sidebar's own
// white/10 hover style instead of the light-shell token classes.

import { useEffect, useRef, useState } from "react";
import { Laptop, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme";
import { useFontSize, type FontSize } from "@/components/providers/font-size";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "larger", label: "Larger" },
];

export function AppearanceControl({ variant = "light" }: { variant?: "light" | "sidebar-dark" }) {
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const [open, setOpen] = useState(false);
  // next-themes' `theme` isn't reliable until after mount (it reads
  // localStorage client-side); avoid a hydration mismatch on the active tab.
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const activeTheme = mounted ? (theme ?? "system") : "system";

  const triggerClass =
    variant === "sidebar-dark"
      ? "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-white/55 transition-colors hover:bg-gray-800 hover:text-white"
      : "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div ref={ref} className={variant === "sidebar-dark" ? "relative" : "relative shrink-0"}>
      <button
        type="button"
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <Palette size={variant === "sidebar-dark" ? 15 : 18} />
        {variant === "sidebar-dark" && "Appearance"}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Appearance settings"
          className="absolute z-50 w-72 rounded-2xl border border-border bg-card p-3 text-foreground shadow-[0_18px_45px_rgba(1,0,102,0.16)]"
          style={variant === "sidebar-dark" ? { bottom: "calc(100% + 0.5rem)", left: 0 } : { right: 0, top: "calc(100% + 0.75rem)" }}
        >
          <p className="px-1 pb-2 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Theme</p>
          <div className="grid grid-cols-3 gap-1.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={activeTheme === opt.value}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                  activeTheme === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <opt.icon size={16} /> {opt.label}
              </button>
            ))}
          </div>

          <p className="mt-3 px-1 pb-2 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Text size</p>
          <div className="grid grid-cols-3 gap-1.5">
            {FONT_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFontSize(opt.value)}
                aria-pressed={fontSize === opt.value}
                className={`flex items-center justify-center rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                  fontSize === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
