# Longevity Remediation Plan — Top 5 Structural Risks

**Status:** Plan only. Author: longevity audit follow-up. Nothing here is implemented yet.

## Context

A 12-dimension longevity audit found the data/security layer sound (RLS on all
81 tables with real `WITH CHECK`, 31 ADRs, tested money paths) but the
operational and query layers weak. This plan gives an implementable fix for the
five highest likelihood×impact risks:

1. Migration files diverge from prod; no rollback — **Critical**
2. Fetch-all query layer (`getComputedActivities`) — **High**
3. No CI — 93 tests run only manually — **High**
4. No observability — console-only, no metrics/health — **High**
5. Service-role sprawl — 63 RLS-bypassing routes — **High**

**Live facts confirmed** (via Supabase MCP): only the `vector` extension is
installed (no PostGIS/earthdistance); catalogue indexes already exist
(`idx_products_*`, `idx_outlets_location`); 104 products / 18 outlets today;
remote migration history is a squashed set that does **not** match the 91 local
`.sql` files. Deploy target is Vercel (cron routes gated on `CRON_SECRET`, no
Dockerfile, no `output` mode). Unit tests mock Supabase → they run secret-less.

**Recommended execution order (safest-first):** #3 → #4 → #2 → #5 → #1.
Rationale: CI is the safety net for everything after it; observability is
additive; the query refactor is behind one function; service-role needs new RLS
policies; migrations are foundational but need credentials and the most care.

---

## Risk #1 — Migration divergence & no rollback (Critical)

**Problem.** `supabase/migrations/` has 91 files with 11 duplicate numeric
prefixes (`009_`–`029_`), and they do **not** reproduce production — the live DB
was built from a squashed history (`create_marketplace_schema`, …) and has
columns/functions that exist in no local file (proven this session: a stray
`preferred_distance` column + a 6-arg RPC). `supabase db reset` from local files
would produce a different schema than prod. There is no documented rollback.

### Method comparison (you chose to see all three)

| | **A. Reconcile forward** (recommended) | **B. Full squash + history repair** | **C. Backups + docs only** |
|---|---|---|---|
| **What** | Dump current prod as ONE baseline file; archive the 91 legacy files out of the apply path; adopt `supabase db diff`/`push` for all future changes; add backups | Same as A, **plus** rewrite the remote `supabase_migrations.schema_migrations` ledger so local and remote histories match exactly | Leave migration files untouched; only add automated `pg_dump` backups + point-in-time recovery + a doc explaining the divergence |
| **Pros** | Fixes "local ≠ prod" permanently; local dev becomes reproducible; low blast radius (baseline is generated *from* prod, so it can't corrupt prod); future changes are gated and diff-authored | Cleanest possible end state; `supabase migration list` shows zero drift; most "correct" for a team that will grow | Zero risk to the live project; fastest; gives you a recovery path immediately |
| **Cons** | The `migration repair` step to mark the baseline as already-applied is fiddly and depends on `supabase migration list` output; needs a Supabase access token or DB password | Everything in A **plus** it mutates the live project's migration bookkeeping — if the repair sequence is wrong you can desync the ledger; marginal benefit over A for an FYP | Root cause remains: local still ≠ prod, so the next hand-written migration can still fail/corrupt against the real schema; only buys recoverability, not correctness |
| **Risk to prod data** | Low | Medium | None |
| **Effort** | ~half a day | ~1 day | ~1–2 hours |
| **Best when** | You want the problem actually solved with acceptable risk | A larger team will maintain this long-term | You need a safety net *today* and will do A/B later |

**Recommendation: A.** It removes the root cause with low risk. B's extra ledger
rewrite is real risk for cosmetic gain on an FYP. C is a good *first hour* but
leaves the rot — do C's backup step as part of A regardless.

### Prerequisite for A or B
A Supabase **access token** (Dashboard → Account → Access Tokens) exported as
`SUPABASE_ACCESS_TOKEN`, **or** the project DB password. Without one, the CLI
can't link. (The CLI itself needs no install — `npx supabase@latest` works;
verified v2.109.1 available.)

### Steps (Method A)
1. `export SUPABASE_ACCESS_TOKEN=...` then `npx supabase link --project-ref ncdlaehknicabzjqskvk`.
2. Capture the real schema as one baseline:
   `npx supabase db dump -f supabase/migrations/00000000000000_baseline.sql`
   (schema/DDL by default; add `--data-only` separately only if you want seed data).
3. Move the 91 legacy files into `supabase/migrations/_archive/` (keep for
   history, out of the apply path). The archive is documentation, not executable.
4. Reconcile the ledger so the baseline isn't re-run and the archived versions
   aren't expected: run `npx supabase migration list` to see local-vs-remote,
   then `npx supabase migration repair --status applied <baseline-version>` and
   `--status reverted <stale-version>` per the list output. **Do this against a
   throwaway branch/shadow first if unsure** — `supabase db diff` will confirm
   zero drift when done.
5. Backups/rollback (also the whole of Method C): enable Supabase PITR (Pro) or
   add a scheduled `pg_dump` job; document a one-page rollback runbook. Going
   forward, author every change with `supabase migration new` + `supabase db
   diff`, apply via `supabase db push` in CI (see #3).

### Verification
- `npx supabase db diff` reports **no differences** between local baseline and prod.
- Fresh `npx supabase db reset` on a local/shadow DB reproduces the prod schema
  (spot-check: `preference_survey_responses` has exactly the columns prod has,
  no `user_preferences`, `nightlife` category present).
- `npx supabase migration list` shows local and remote in sync.

---

## Risk #2 — Fetch-all query layer (High)

**Problem.** Every customer read funnels through two fetch-everything functions
in [backend/domains/catalogue.ts](../backend/domains/catalogue.ts):
`getActivities` (all active products) + `getOutlets` (all outlets), joined and
filtered **in JavaScript** by `searchActivities` (`catalogue.ts:235`). Worst
case: `getComputedActivity(id)` (`catalogue.ts:219`) pulls the **entire
catalogue** to find one row, and `app/customer/wishlist/page.tsx:26` calls it
per wishlist row → N full-catalogue scans. Pagination is client-side `.slice()`
everywhere (`home-client.tsx:73`, `search-client.tsx:116`). Fine at 104
products; a cliff at 10×.

**Scale note:** not urgent today (104/18 rows). Prioritise the two changes with
the best risk/reward, mark the rest with a `// ponytail:` ceiling comment.

### Approach (incremental, highest-value first)
1. **Fix `getComputedActivity(id)` first** — replace the whole-catalogue scan
   with two point queries: one `products` row by `id`, one `outlets` row by its
   `outlet_id`. Kills the wishlist N-scan and the detail-page scan. Smallest
   diff, biggest win, zero API change.
2. **Push `SearchFilters` into SQL** in `getComputedActivities`/`searchActivities`:
   - Add `page?` / `pageSize?` to the `SearchFilters` interface (`catalogue.ts:224`).
   - Build the query with server-side chaining — copy the exact pattern from
     [app/api/vendors/[vendorId]/products/route.ts:28-55](../app/api/vendors/[vendorId]/products/route.ts)
     (`.select(..., { count: 'exact' })`, conditional `.eq()`, sanitised
     `.or('name.ilike.%..%,...')` with `q.replace(/[%(),]/g,' ')`, dynamic
     `.order()`, `.range((page-1)*size, page*size-1)`). `getProductReviewsPage`
     (`catalogue.ts:169`) is the same shape already living in this file.
   - Category filter: today it compares category **name** in JS; in SQL filter by
     `category_id` (map slug→id via the `categories` table, or join and filter on
     `categories.slug`).
   - **Distance:** no PostGIS/earthdistance installed. Use a **bounding-box
     prefilter** on `outlets.lat/lng` (`.gte/.lte` from center ± radius, served
     by `idx_outlets_location`), then compute precise `haversineKm` + sort in JS
     on the *reduced* set. `// ponytail: bbox + JS haversine; swap for a
     match_listings RPC + earthdistance/PostGIS only if the catalogue outgrows a
     few thousand rows.`
   - Move client `.slice` pagination server-side: return `{ items, total, page,
     pageSize }`; callers pass `page`/`pageSize` instead of slicing. RSC/client
     callers already pass structured filter objects, so only the paging fields
     are new.
3. **Protect the recommender.** `getRecommendedFeed` (`recommend.ts:62`) feeds on
   `searchActivities({ near, sort:'recommended' })` and re-ranks in JS, so it
   needs a **broad candidate pool** — do **not** apply the final SQL `LIMIT`/
   `.range` to the recommender's call. Give it a filtered-but-unpaginated path
   (budget/radius `.eq/.lte` to shrink the pool, no top-N `LIMIT` before
   scoring). Score-dependent ranking (collaborative, learned-affinity, time
   boost) stays post-fetch in JS. The `// ponytail` comment at `recommend.ts:4`
   already flags the eventual `match_listings` RPC.
4. **Text-search index (scale ceiling, optional now):** enable `pg_trgm` + a GIN
   index on `products.name` when `q` search gets slow. Note only; 104 rows don't
   need it.

### Verification
- Detail page + wishlist: DB query logs show a single-row product fetch, not a
  full-table scan (Supabase dashboard → Logs, or `EXPLAIN` via MCP).
- Home/search: server returns only `pageSize` rows; pagination controls still
  work; existing catalogue tests
  ([catalogue-filters.test.ts](../backend/domains/__tests__/catalogue-filters.test.ts))
  still pass. Add a test asserting `searchActivities({ pageSize: 8 })` returns ≤8
  and that filters are applied in SQL (mock returns filtered set).
- Recommendation feed unchanged: `recommend-score.test.ts` still green; feed
  still surfaces in-interest items (manual check).

---

## Risk #3 — No CI (High)

**Problem.** No `.github/workflows/`. 93 test files run only when someone types
`npm test`. Nothing gates a red merge.

**Facts:** npm (`package-lock.json`), Node 20 (`@types/node ^20`), scripts have
**no `typecheck`**, `lint` is bare `eslint` (rules demoted to `warn` → won't
fail on warnings). Unit tests mock Supabase → pass with **no secrets**. `next
build` only needs placeholder `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` (server
secrets are read lazily inside handlers). Playwright e2e **needs** a seeded live
Supabase + real login → **must be a separate credentialed job**, not on PRs.

### Steps
1. Add script to `package.json`: `"typecheck": "tsc --noEmit"`.
2. Create `.github/workflows/ci.yml` — runs on every push/PR:
   ```yaml
   name: CI
   on: [push, pull_request]
   concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
   jobs:
     verify:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: npm }
         - run: npm ci
         - run: npm run typecheck
         - run: npm run lint
         - run: npm test
         - run: npm run build
           env:
             NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
             NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
             NEXT_PUBLIC_SITE_URL: http://localhost:3000
   ```
3. (Optional) `.github/workflows/e2e.yml` — `workflow_dispatch` + nightly
   `schedule`; provisions secrets from GitHub Actions secrets, seeds the DB
   (`npm run seed:remote-scenarios`), then `npx playwright test`. Do **not** put
   e2e on the PR path.
4. (Ties to #1) add a `supabase db push` step in a deploy workflow so schema
   changes go through the gated flow, not ad-hoc MCP calls.

### Verification
- Open a PR with a deliberate type error → CI fails at `typecheck`. Fix → green.
- CI completes without any real secrets (only the three placeholder `NEXT_PUBLIC_*`).
- Badge/checks appear on PRs.

**Ponytail note:** one workflow file, reuses existing scripts. Don't add
coverage gates, matrix builds, or release automation until there's a reason.

---

## Risk #4 — No observability (High)

**Problem.** No logger, no request-id, no `/api/health`. Logging is 63 raw
`console.*` calls with ad-hoc `[tag]` prefixes. First production incident is
undebuggable. Two response conventions coexist: the `apiOk/apiFail` envelope
([lib/validation/schemas.ts:100](../lib/validation/schemas.ts)) in newer routes,
raw `NextResponse.json({error})` in stripe/cron routes.

### Approach (no new dependency — Vercel captures stdout)
1. **`lib/log.ts`** — ~20-line structured logger, no dep:
   ```ts
   type Level = 'info' | 'warn' | 'error';
   export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
     const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() });
     (level === 'error' ? console.error : console.log)(line);
   }
   ```
   Ponytail: JSON-to-stdout is the *recommended* pattern on Vercel; pino only if
   you later need transports/sampling. `// ponytail: JSON console logger; add pino
   if you need log transports or sampling.`
2. **Request-id.** Add `getRequestId(req)` reading `x-vercel-id` (Vercel sets it)
   or `crypto.randomUUID()` fallback. Thread it into the error envelope so
   support can correlate: extend `apiFail` to accept/emit `requestId` in
   `error.requestId`, and pass it to `log('error', ...)` at each catch site.
3. **`app/api/health/route.ts`** — new route, `export const dynamic = 'force-dynamic'`:
   cheap DB ping (`supabase.from('platform_settings').select('key').limit(1)`),
   return `{ status:'ok', version, db:'ok' }` (200) or `{ status:'degraded' }`
   (503) on failure. Wire to Vercel/uptime monitor.
4. **Standardise error surfaces.** Convert the stripe/cron routes' raw
   `NextResponse.json({error})` to `apiFail(...)` and log via `log('error',...)`
   in their catch blocks — the highest-value error sites (payments, cron).

### Verification
- Hit a failing endpoint → structured JSON error line in Vercel logs with a
  `requestId` that matches the `error.requestId` in the HTTP response.
- `GET /api/health` returns 200 with DB reachable; simulate DB down → 503.
- No behaviour change to success paths (envelope unchanged for `apiOk`).

---

## Risk #5 — Service-role sprawl (High)

**Problem.** 63 route/lib files use the service-role client
([lib/supabase/service.ts](../lib/supabase/service.ts)), which **bypasses RLS**.
Many are legitimate (webhooks, cron, admin, KYC-by-design). But some user-facing
routes bypass RLS and must self-enforce auth — 63 places to get an IDOR wrong,
with no `middleware.ts` backstop.

**Inventory (from code sweep):**
- **Legit, keep as service:** all `app/api/admin/**` + `admin-ai/*`; all
  webhooks/cron (`stripe/*`, `cron/*`, `checkout/confirm-stripe`,
  `outlet-manager-invitations/[token]`); `kyc/upload` (table writes REVOKED by
  design → SECURITY DEFINER RPC + private bucket); `affiliate/rank` (cross-user
  aggregate); private-bucket signed-URL half of `orders/digital`.
- **Cleanly movable to anon+RLS today (policy already exists):**
  `kyc/submission` (GET, `kyc_select_own`), `orders/receipt` (POST, all reads
  covered by `orders_own_or_admin` / `order_items_own_or_vendor` /
  `users_select_own_or_admin`).
- **Movable after adding a small RLS write policy:** `chat/[threadId]/read` &
  `delivered` (need INSERT/UPDATE policy on `chat_message_reads` /
  `chat_message_deliveries`: `user_id = auth.uid()` + participant), `support/
  tickets/[id]/read` & `reopen` (need own-row UPDATE policy on `support_tickets`).

### Method comparison (you chose to see all three)

| | **A. Targeted + guardrail** (recommended) | **B. Full sweep now** | **C. Guardrail only** |
|---|---|---|---|
| **What** | Add the missing RLS write policies; move the ~4–6 clearly-safe user-facing routes to anon+RLS; add a CI check that flags any *new* `createServiceClient` in a non-admin/non-webhook route | Audit + migrate *every* user-facing (U) route to anon+RLS this pass, writing all needed policies | Add only the CI check; migrate nothing |
| **Pros** | Removes the genuinely-risky bypasses; stops future sprawl; each policy is small and testable; bounded regression surface | Most thorough; smallest long-term service-role footprint | Zero regression risk; freezes the problem; ~1 hour |
| **Cons** | Doesn't touch every (U) route (some stay service-role, documented) | Touches many routes + policies at once → high regression risk; several routes (support replies, recommendations/claim) have dual-role/token logic that resists a clean RLS model | Existing bypasses remain; only prevents new ones |
| **Risk** | Low–Medium | High | None |
| **Effort** | ~1 day | ~3–4 days | ~1 hour |

**Recommendation: A.** It fixes the routes that actually bypass RLS on
single-user data while adding a guardrail so the count stops climbing. B's
extra reach hits routes whose token/dual-role logic (e.g.
`recommendations/claim`, `support/tickets/[id]/replies`) is legitimately
service-role — forcing them to RLS is net-negative.

### Steps (Method A)
1. **New RLS policies** (one small migration, authored via the #1 CLI flow):
   INSERT/UPDATE-own+participant on `chat_message_reads` & `chat_message_deliveries`;
   own-row UPDATE on `support_tickets` for `*_last_read_at` / reopen. Follow the
   house style (`DROP POLICY IF EXISTS` → `CREATE POLICY ... TO authenticated
   USING/WITH CHECK (user_id = auth.uid() [+ participant])`).
2. **Migrate the safe routes** from `createServiceClient()` to the cookie-bound
   `createClient()` ([lib/supabase/server.ts](../lib/supabase/server.ts)):
   `kyc/submission` (GET), `orders/receipt`, then `chat/read`, `chat/delivered`,
   `support/read`, `support/reopen` (after step 1). Each keeps its existing
   `getUser()` check; RLS now enforces the row scope as defense-in-depth.
3. **Guardrail** — a CI grep step (add to `ci.yml`) that fails if a new file
   under `app/api/` (excluding `app/api/admin/**`, `stripe/*`, `cron/*`, an
   allowlist) imports `@/lib/supabase/service`. Forces a conscious review for
   each new bypass.
4. **(Optional, related) `middleware.ts`** central auth gate for `/admin` and
   `/vendor` route groups — turns per-route checks into defense-in-depth rather
   than the only line.

### Verification
- For each migrated route: signed-in user still succeeds; a different user is
  denied by RLS (not just by app code) — test by calling with another user's
  token and asserting 0 rows / 403.
- New RLS policies covered by a test asserting cross-user write is rejected.
- CI guardrail: a PR adding `createServiceClient` to a non-allowlisted
  `app/api/...` route fails the check.

---

## Sequencing & dependencies

| Order | Risk | Depends on | Credentials needed |
|---|---|---|---|
| 1 | #3 CI | — | GitHub repo settings |
| 2 | #4 Observability | — | — |
| 3 | #2 Query layer | CI (#3) green to catch regressions | — |
| 4 | #5 Service-role | CI (#3); RLS policies use #1's CLI flow if adopted | — |
| 5 | #1 Migrations | CI (#3) for the gated push step | **Supabase access token / DB password** |

`#1` is Critical but sequenced last because it needs your credentials and the
most care; do its **backup step (Method C's content) first** regardless, so you
have a recovery path before touching anything.

## Global verification (after all phases)
- `npm run typecheck && npm run lint && npm test && npm run build` all green locally and in CI.
- `npx supabase db diff` shows no drift; `db reset` reproduces prod.
- `/api/health` green; a forced error yields a correlated `requestId` in logs.
- Catalogue detail/wishlist no longer full-scan; feed unchanged.
- Migrated routes enforce row scope via RLS (cross-user denied at DB layer).
