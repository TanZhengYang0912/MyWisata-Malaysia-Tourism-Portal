# Dark mode + font-size accessibility — team audit

Built per `CLAUDE-DARKMODE-A11Y.md` (team-approved shared infrastructure). This is the handoff
note for the parts that are **not yet done** — everyone's own pages still need a pass.

## What's live now (works everywhere, for free)

- **Theme toggle** (Light / Dark / System) + **text-size control** (Normal / Large / Larger), in
  one "Appearance" popover — mounted in the customer header, the vendor sidebar, and the admin
  sidebar. Persists (localStorage), no flash on load, respects OS default under "System".
- `app/globals.css` now has a full `.dark` token palette (WCAG AA tuned, not a flat invert) and
  `@custom-variant dark (&:where(.dark, .dark *));` — **this line matters for you**: Tailwind v4
  defaults `dark:` to `prefers-color-scheme` only. Any `dark:` class you've already written
  (e.g. `components/ui/badge.tsx`'s status colors) was previously dead unless the OS itself was in
  dark mode — it's now live under the manual toggle too, no action needed on your end.
- Root font-size scales via `data-font-size` on `<html>` (18px/20px) — **any text sized with
  Tailwind's normal classes (`text-sm`, `text-base`, `text-lg`, ...) already scales with it for
  free.** Nothing to do there either.
- I converted the shared shell (customer nav, vendor sidebar, admin sidebar, notification bell,
  the shared `Badge`/`StatusBadge` components) plus all of my own module's pages (affiliate,
  chatbot, support, admin AI/staff-conduct) to theme tokens and rem sizing, and verified it live
  (screenshots below, plus `tsc`/`vitest` clean, 1151 tests passing).

## What breaks it, and where

Two independent things stop a page from theming/scaling correctly:
1. **Hardcoded colors** (`bg-white`, `text-gray-700`, raw hex) instead of tokens
   (`bg-card`, `text-muted-foreground`, ...) — these don't switch in dark mode at all.
2. **Fixed-px font sizes** (`text-[14px]`, inline `fontSize`) instead of Tailwind's rem-based
   `text-sm`/`text-base`/etc — these don't grow with the text-size control.

**Visually confirmed broken right now:** `/vendor/dashboard` in dark mode — the stat cards and
"Sales performance" panel stay bright white while the sidebar and page background go dark. Same
mechanism affects every file below.

I did **not** touch any of these — they're outside my module, flagging per plan rather than
silently rewriting someone else's component.

### Prioritized (rough instance counts — hardcoded color / fixed-px font)

| File | Hardcoded colors | Fixed-px font | Owner area |
|---|---:|---:|---|
| `app/customer/design-demo/design-demo-client.tsx` | 54 | 22 | customer (design-demo) |
| `app/customer/search/search-client.tsx` | 42 | 10 | customer (search) |
| `app/admin/vendors/page.tsx` | 33 | 8 | admin (vendor approvals) |
| `components/vendor/product-form.tsx` | 30 | 2 | vendor |
| `components/vendor/voucher-csv-builder.tsx` | 29 | 4 | vendor |
| `components/vendor/outlet-page-builder.tsx` | 28 | 7 | vendor (outlet builder) |
| `components/vendor/vendor-share-analytics.tsx` | 25 | 0 | vendor |
| `components/demo-map/malaysia-district-map.tsx` | 25 | — | map |
| `app/vendor/profile/page.tsx` | 21 | 1 | vendor |
| `components/vendor/outlet-builder-inspector.tsx` | 18 | — | vendor (outlet builder) |
| `app/vendor/inbox/page.tsx` | 18 | 4 | vendor (inbox) |
| `app/vendor/dashboard/page.tsx` | 18 | 0 | vendor (dashboard) — **screenshot-confirmed broken** |
| `components/vendor/outlet-pie-chart.tsx` | 17 | — | vendor |
| `components/vendor/outlet-form.tsx` | 17 | — | vendor |
| `components/map/maplibre-map.tsx` | 17 | — | map |
| `components/vendor/voucher-form.tsx` | 16 | — | vendor |
| `components/vendor/sales-chart.tsx` | 16 | — | vendor |
| `app/vendor/vouchers/page.tsx` | 16 | — | vendor |

The `outlet-builder-*` cluster (canvas/inspector/palette/form) is the single biggest block of
work — it's a page-builder UI with its own heavy styling, likely wants a dedicated pass rather
than a quick token swap.

### How to fix your own page (same pattern I used everywhere)

- `bg-white` → `bg-card` (or `bg-background` for the page-level surface)
- `text-black` / `text-gray-900` → `text-foreground`
- `text-gray-500`/`600` → `text-muted-foreground`
- `bg-gray-100`/`50` → `bg-muted` or `bg-secondary`
- `border-gray-200` → `border-border`
- Raw hex → the closest semantic token in `app/globals.css` (or add a new token pair if nothing
  fits — put the light value under `:root` and the dark value under `.dark`, same pattern as the
  existing tokens)
- `text-[14px]` → `text-[0.875rem]` (divide the px by 16, keep it as an arbitrary rem value — or
  just use `text-sm`/`text-base` if it matches a standard step)

Charts/maps (`sales-chart.tsx`, `outlet-pie-chart.tsx`, `maplibre-map.tsx`,
`malaysia-*-map.tsx`) likely also need their *inline* colors (recharts/maplibre don't take
Tailwind classes) switched via `getComputedStyle` on a CSS variable, or a light/dark color prop —
happy to help wire that pattern up if useful, didn't want to guess at your chart configs.

Not urgent — the toggle works platform-wide today, these pages just won't look right in dark mode
or at larger text sizes until converted.
