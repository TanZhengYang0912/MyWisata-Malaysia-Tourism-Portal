# Automatic Next.js Development Cache Guard

**Status:** Approved design; implementation pending.

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
- Remove `.next/dev/cache/turbopack` whenever it exists because it is unused by
  the Webpack development command.
- After removing stale Turbopack data, remove the whole generated `.next`
  cache only when its remaining size exceeds 2 GiB. Preserve an active
  `.next/dev-stripe.lock`, because `npm run dev:stripe` acquires that launcher
  lock before it starts `npm run dev`; stale launcher locks may be removed.
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
| Existing development launcher | `scripts/dev-stripe.mjs` | Reuse unchanged | It starts `npm run dev`, so it automatically receives the guard. Its live `.next/dev-stripe.lock` must be preserved during a threshold cleanup. |
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
    live-server refusal, active Stripe-lock preservation, and stale-lock cleanup
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
An oversized cleanup may leave only a live `dev-stripe.lock` in place. It will
accept injected paths/process checks for deterministic tests but will not expose
test-only behavior in the CLI.

## Scope Boundaries

- No application routes, React components, Supabase migrations, permissions, or
  production behavior will change.
- No automatic process killing or background scheduler will be introduced.
- No deletion target outside the repository-local `.next` directory is allowed.
- No changes to `dev:stripe` are required because the guard preserves its live
  launcher lock and it already delegates to `npm run dev`.

## New Dependencies

None. Use only Node.js built-ins.

## Database Changes

None.

## Risks and Controls

- **Deleting an active cache:** parse `.next/dev/lock` and verify its PID before
  cleanup; fail closed when it is live.
- **Breaking the Stripe launcher lock:** inspect `.next/dev-stripe.lock` using
  its existing PID ownership format; retain it when the owner is alive and
  remove it only when stale.
- **Deleting an unrelated path:** derive all targets from an explicit repository
  root and validate that cleanup targets remain inside its `.next` directory.
- **Slow startup scan:** remove the known Turbopack subtree first, then scan only
  the remaining cache; preserve it when under 2 GiB.
- **Cold compile after genuine cleanup:** print why cleanup occurred so the first
  slower route render is expected.
- **Stale or malformed lock:** treat a demonstrably dead PID as stale; malformed
  lock content fails closed rather than authorizing deletion.

## Implementation Phases

1. Extend the existing contract test and add Node tests for the desired cache
   policy; run them and confirm they fail because the helper and `predev` do not
   exist.
2. Implement the filesystem helper and CLI with the minimum behavior required
   by the tests.
3. Add the `predev` package entry and README explanation.
4. Run focused tests, TypeScript, lint, and a temporary-directory CLI smoke test.
5. Perform one independent read-only review focused on deletion scope and live
   process safety, then address only confirmed must-fix findings.

## Verification

- `node --test scripts/lib/next-dev-cache.test.mjs`
- `npx vitest run scripts/__tests__/next-dev-server.contract.test.ts`
- Temporary-directory smoke test proving only the supplied `.next` tree changes.
- `npx tsc --noEmit`
- `npm run lint`
- `git diff --check`
