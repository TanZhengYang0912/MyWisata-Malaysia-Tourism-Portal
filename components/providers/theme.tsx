"use client";

// CLAUDE-DARKMODE-A11Y.md Feature 1 — thin wrapper so callers import from
// the same components/providers/* location as every other app provider
// (auth, cart, trip, ...) rather than reaching into next-themes directly.
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

export { useTheme } from "next-themes";
