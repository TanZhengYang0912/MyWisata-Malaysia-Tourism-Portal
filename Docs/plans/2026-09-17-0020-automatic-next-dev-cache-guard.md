# Automatic Next.js Development Cache Guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented and verified on 2026-09-17.

**Verification result:** Cache-guard Node tests passed (12/12), the existing
Next development contract passed (2/2), Stripe launcher tests passed (11/11),
the full Vitest suite passed (768 files and 3,818 tests; 12 files and 42 tests
skipped), `npx tsc --noEmit` passed, and ESLint completed with 0 errors and 80
pre-existing warnings.

**Goal:** Make `npm run dev` automatically remove unsafe or oversized generated Next.js cache data without deleting a live server's files or forcing every startup to cold-compile.

**Architecture:** A cross-platform Node.js `predev` command applies a repository-local cache policy before the existing Webpack runner starts. Filesystem behavior lives in a separately tested helper; the CLI only resolves the repository root, invokes the helper, and reports the result.

**Tech Stack:** Node.js 20 built-ins, npm lifecycle scripts, Next.js 16 Webpack development mode, Node test runner, Vitest.

## Context

The project already runs Next.js development with Webpack because a prior
Turbopack process grew to roughly 12 GB RSS and left pages waiting on
`Rendering...`. The same symptom returned after a development server remained
running for more than a day: the process grew from roughly 4.2 GB to 8.1 GB RSS
after a cold route compile, while `.next` occupied 8.8 GB. About 8.0 GB was a
stale Turbopack cache from an older run.

Deleting `.next` manually recovers the development environment, but every
developer must remember to do it on their own computer. The startup command
should therefore enforce a safe cache policy without making every startup a
full cold compile.

## Decisions

- Keep `next dev --webpack`; do not re-enable Turbopack.
- Run a cross-platform Node.js cache guard automatically through `predev`.
- Never delete a live development server's cache. If `.next/dev/lock` identifies
  a live process, fail with an actionable message instead.
- If `.next/dev/lock` contains a valid but dead PID, skip cache cleanup without
  failing `predev` and let Next.js apply its own stale-lock behavior.
- Remove `.next/dev/cache/turbopack` whenever it exists because it is unused by
  the Webpack development command.
- Acquire `.next/dev/lock` atomically for the cleanup window so another standard
  Next startup cannot pass the same check and begin writing during deletion.
- After removing stale Turbopack data, remove the whole generated `.next`
  cache only when its remaining size exceeds 2 GiB. Always preserve
  `.next/dev-stripe.lock`, because `npm run dev:stripe` acquires that launcher
  lock before it starts `npm run dev`; stale launcher-lock recovery remains the
  existing Stripe launcher's responsibility.
- Preserve a normal-sized Webpack cache so routine restarts remain warm.
- Do not add a timer that deletes cache while Next.js is running. Live deletion
  can corrupt the active compiler and cannot release memory already retained by
  the Node.js process.
- A long-running process still needs to be stopped and restarted; this guard
  makes the cleanup automatic at the next normal `npm run dev`.

## Alternatives Considered

1. **Delete `.next` before every startup.** Rejected because every startup would
   pay the full cold-compilation cost and make `Rendering...` more frequent.
2. **Scheduled `rm -rf` while the server is running.** Rejected because it can
   remove files from an active compiler and does not reduce the process RSS.
3. **Conditional startup guard.** Selected because it removes known stale data,
   preserves healthy caches, is committed with the repository, and requires no
   developer memory or machine-specific scheduler.

## Reuse Audit

| Candidate | Exact file | Decision | Reason |
|---|---|---|---|
| Stable Webpack development contract | `scripts/__tests__/next-dev-server.contract.test.ts` | Extend | It already protects the required `next dev --webpack` behavior and is the correct place to assert the new `predev` entry point. |
| Script helper/test layout | `scripts/lib/stripe-dev-env.mjs`, `scripts/lib/stripe-dev-env.test.mjs` | Reuse pattern | These establish cross-platform `.mjs` helpers tested with `node:test` and temporary directories. |
| Existing development launcher | `scripts/dev-stripe.mjs` | Reuse unchanged | It starts `npm run dev`, so it automatically receives the guard. Its `.next/dev-stripe.lock` must never be deleted by the cache guard. |
| Stripe launcher lock tests | `scripts/lib/stripe-dev-env.test.mjs` | Reuse contract | They establish that the lock contains an owner PID and stale locks are recoverable; the cache guard will follow the same ownership rule without duplicating the launcher. |
| Prior stabilization record | `Docs/plans/2026-08-20-2141-stabilize-next-dev-server.md` | Extend operational decision | It establishes Webpack and generated-cache cleanup as the accepted recovery strategy. |
| Unconditional shell `rm -rf` | None | Reject | It is platform-specific, unsafe against a live process, and forces cold compilation every time. |

**Reuse audit complete.**

## Files to Modify

- `package.json`
  - Add `predev` pointing to the cache guard; keep `dev` and `build` on Webpack.
- `scripts/lib/next-dev-cache.mjs`
  - Add the cache policy, directory-size calculation, live-lock validation, and
    bounded cleanup functions.
- `scripts/lib/next-dev-cache.test.mjs`
  - Test normal-cache preservation, stale Turbopack removal, threshold cleanup,
    live-server refusal, atomic cleanup locking, and Stripe-lock preservation
    using temporary directories.
- `scripts/prepare-next-dev-cache.mjs`
  - Resolve the repository-local `.next`, invoke the helper, and print a concise
    startup result without exposing environment data.
- `scripts/__tests__/next-dev-server.contract.test.ts`
  - Protect the exact `predev`, `dev`, and `build` commands.
- `README.md`
  - Explain that `npm run dev` performs conditional cleanup and that a process
    left running for an extended period must still be restarted.

## Exact Interfaces

`scripts/lib/next-dev-cache.mjs` will export:

```js
export const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 ** 3;
export function directorySize(pathname) {}
export function readLiveNextDevLock(lockPath, isProcessAlive) {}
export function prepareNextDevCache(options) {}
```

`prepareNextDevCache` will return a small result describing whether it removed
the Turbopack cache, cleaned oversized `.next` contents, or preserved the cache.
An oversized cleanup may leave only `dev-stripe.lock` in place. It will
accept injected paths/process checks for deterministic tests but will not expose
test-only behavior in the CLI.

## Scope Boundaries

- No application routes, React components, Supabase migrations, permissions, or
  production behavior will change.
- No automatic process killing or background scheduler will be introduced.
- No deletion target outside the repository-local `.next` directory is allowed.
- No changes to `dev:stripe` are required because the guard never removes its
  launcher lock and it already delegates to `npm run dev`.

## New Dependencies

None. Use only Node.js built-ins.

## Database Changes

None.

## Risks and Controls

- **Deleting an active cache:** strictly parse `.next/dev/lock`, fail closed when
  its PID is live, and atomically own that lock throughout cleanup.
- **Crash-stale Next lock:** leave the lock untouched, skip cleanup for that
  startup, and return success so the Next runner—not the cache guard—decides how
  to recover it.
- **Breaking the Stripe launcher lock:** never remove `.next/dev-stripe.lock`;
  its existing launcher already owns stale-lock detection and recovery.
- **Deleting an unrelated path:** derive all targets from an explicit repository
  root and validate that cleanup targets remain inside its `.next` directory.
- **Slow startup scan:** remove the known Turbopack subtree first, then scan only
  the remaining cache; preserve it when under 2 GiB.
- **Cold compile after genuine cleanup:** print why cleanup occurred so the first
  slower route render is expected.
- **Stale or malformed lock:** treat a demonstrably dead PID as stale; malformed
  lock content fails closed rather than authorizing deletion.

## Implementation Phases

- [x] **Task 1 — RED:** Extend the existing package-script contract and add
  temporary-directory Node tests for healthy-cache preservation, Turbopack
  removal, threshold cleanup, live Next refusal, and Stripe-lock handling. Run
  both focused test commands and confirm the missing helper/`predev` failures.
- [x] **Task 2 — GREEN:** Implement `scripts/lib/next-dev-cache.mjs` and
  `scripts/prepare-next-dev-cache.mjs`, then run both focused suites to green.
- [x] **Task 3 — Integration:** Add the `predev` lifecycle entry and document the
  behavior in `README.md`; rerun the focused suites.
- [x] **Task 4 — Verification:** Run the temporary-directory smoke test,
  TypeScript, lint, and `git diff --check`; then request one independent
  deletion-scope and lock-safety review from `luna_worker`.

## Verification

- `node --test scripts/lib/next-dev-cache.test.mjs`
- `npx vitest run scripts/__tests__/next-dev-server.contract.test.ts`
- Temporary-directory smoke test proving only the supplied `.next` tree changes.
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`
