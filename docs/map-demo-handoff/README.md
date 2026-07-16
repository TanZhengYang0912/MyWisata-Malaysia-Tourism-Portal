# Local Malaysia Story Map Demo

This folder contains the Malaysia map demo implementation for handoff.

## Included

- `app/demo/map/` — the `/demo/map` listing page and place detail route
- `components/demo-map/` — story-map UI and the custom Malaysia state map
- `lib/demo-map/` — local mock data, state geometry, route helpers, and tests
- `components/providers/app-providers.tsx` — keeps the demo route independent from Supabase providers
- `app/layout.tsx` — the matching layout integration used by this demo
- `Docs/` — the design specification and implementation plan

## Setup in another copy of the project

Copy the contents of this folder into the project root while keeping the same directory structure. The project should already have its existing dependencies installed.

Run:

```bash
npm run dev -- --port 3001
```

Then open [http://localhost:3001/demo/map](http://localhost:3001/demo/map).

The demo uses local mock data only. It does not require Supabase. The map shows all 16 Malaysian states and federal territories, and the Directions button opens an external maps URL only when selected.

## Important

Do not replace the recipient's project files blindly if they have a different `app/layout.tsx`. Merge the `AppProviders` integration into that file so the recipient's existing providers remain intact.
