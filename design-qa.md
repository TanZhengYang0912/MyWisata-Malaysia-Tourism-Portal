# Explore Malaysia Map Visual QA

## Source and implementation

- Source reference: `/var/folders/hl/jm61t0bs593bjkmm1k4v027c0000gn/T/codex-clipboard-53b69dd3-0d42-4cdc-9cf5-212be090451f.png`
- Implementation capture: `/tmp/mywisata-explore-optimized.png`
- Route: `http://localhost:3000/customer/explore`
- Browser capture: 1280 × 720, authenticated local demo session

## Comparison checklist

- [x] Wide rounded blue-gray map plate with the same landscape proportion direction as the reference.
- [x] Reference-style English header: Malaysia, All states and federal territories, and the independent-scaling note.
- [x] West Malaysia and Borneo are projected with separate bounds and canvases so both regions remain readable.
- [x] MyWisata indigo map palette, quiet grid, compact white label cards, and orange geographic anchor dots match the product theme while preserving the reference hierarchy.
- [x] All 16 states/federal territories are labeled in English outside the landmasses.
- [x] Each label uses an individual orthogonal callout route with varied elbow positions; no diagonal `<line>` connectors remain.
- [x] Experiences list is placed below the full-width map plate as a readable 4×2 desktop card grid; it stacks responsively on smaller widths instead of using a narrow side rail. The 2xl row is allocated 320px so the larger cards and both rows remain fully visible.
- [x] DOM verification confirmed 16 fixed-size HTML label buttons, 16 callout paths, 8 visible experience cards, and no horizontal overflow.
- [x] State labels use fixed CSS sizing at desktop breakpoints, with larger 2xl typography, so label readability does not depend on SVG scaling.
- [x] Peninsular and Borneo canvases were enlarged without changing the external callout pattern.
- [x] Desktop layout uses a bounded viewport workspace: the map fills the content width above a readable 4×2 card grid so the complete Explore overview is visible without page scrolling.
- [x] Native SVG map/state title tooltips are removed; the SVG keeps its accessible role and aria label without hover overlays.
- [x] Existing selection and keyboard interaction contracts remain covered by tests.
- [x] Final browser check confirmed a 1214px-wide map at 1280px viewport width, 16 labels and 8 cards are visible in one viewport, 16 orthogonal routes with 0 detected crossings, no tooltips, no horizontal overflow, Pahang selection remains indigo-highlighted, and the floating chat control has an accessible name.
- [x] Large-screen review fixed the experience panel's second-row clipping by increasing only the 2xl list allocation from 280px to 320px; the map remains the dominant region and the list cards keep their larger typography.

## Verification history

- Focused map tests: 11 passed.
- Full test suite: 224 test files passed, 1 skipped; 738 tests passed, 9 skipped.
- TypeScript: `npx tsc --noEmit` passed.
- Lint: passed with existing project warnings only.
- Production build: `npm run build` passed.
- Diff whitespace check: `git diff --check` passed.

## Final result: passed
