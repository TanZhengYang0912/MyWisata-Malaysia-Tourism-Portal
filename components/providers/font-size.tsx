"use client";

// CLAUDE-DARKMODE-A11Y.md Feature 2 — scales the root <html> font-size so
// every rem-based Tailwind text utility (text-sm, text-base, ...) scales
// with it for free. Mirrors next-themes' own no-flash approach: FontSizeScript
// below is a blocking inline script rendered as early as possible in <body>
// (see app/layout.tsx) that applies the saved preference before first paint,
// since the lazy useState initializer alone only avoids an extra render, not
// the flash (this runs during SSR too, before any client JS executes).

import { createContext, useContext, useEffect, useState } from "react";

export type FontSize = "normal" | "large" | "larger";

const STORAGE_KEY = "mw_font_size";
const VALID_SIZES: FontSize[] = ["normal", "large", "larger"];

function readStoredFontSize(): FontSize {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return VALID_SIZES.includes(stored as FontSize) ? (stored as FontSize) : "normal";
}

interface FontSizeContextValue {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
}

const FontSizeContext = createContext<FontSizeContextValue | null>(null);

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => readStoredFontSize());

  useEffect(() => {
    if (fontSize === "normal") {
      document.documentElement.removeAttribute("data-font-size");
    } else {
      document.documentElement.setAttribute("data-font-size", fontSize);
    }
  }, [fontSize]);

  function setFontSize(size: FontSize) {
    setFontSizeState(size);
    window.localStorage.setItem(STORAGE_KEY, size);
  }

  return <FontSizeContext.Provider value={{ fontSize, setFontSize }}>{children}</FontSizeContext.Provider>;
}

export function useFontSize() {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error("useFontSize must be used within a FontSizeProvider");
  return ctx;
}

const NO_FLASH_SCRIPT = `(function(){try{var v=window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(v==="large"||v==="larger"){document.documentElement.setAttribute("data-font-size",v);}}catch(e){}})();`;

/** Render as the very first child of <body>, before any other provider. */
export function FontSizeScript() {
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />;
}
