# Stabilize Next.js Development Server

**Status:** Complete

## Context

The Next.js 16.2.10 Turbopack development process grew to roughly 12 GB RSS and saturated about 10 CPU cores. Route compilation for `/admin/users` and `/api/stripe/create-checkout` then queued for minutes, leaving the UI on `Rendering...` or `Loading...`. Warm API responses and direct Supabase probes were fast, so the confirmed bottleneck is development compilation rather than the user-management RPC or Stripe handler runtime.

## Decisions

- Use Next.js's installed `--webpack` development mode as the smallest stable fallback.
- Remove only the generated project-local `.next` cache before restarting.
- Keep all admin, wallet, Stripe, authentication, and database behavior unchanged.
- Treat request cancellation/timeouts as follow-up UX work, not part of this repair.

## Scope

### Files to modify

- `package.json`
  - Change `scripts.dev` from `next dev` to `next dev --webpack`.

### Functions and components affected

- No application functions or React components are changed.
- Only the local development-server entry point is affected.

### Files not being touched

- `app/admin/layout.tsx`
- `app/admin/users/page.tsx`
- `app/api/admin/users/route.ts`
- `app/customer/wallet/page.tsx`
- `app/api/stripe/create-checkout/route.ts`
- `supabase/migrations/**`

### Dependencies and database

- New dependencies: none.
- Database changes: none.

### Risks

- The first cold compilation after clearing `.next` will take longer than a warm request.
- Webpack hot reload can be slower than Turbopack, but it avoids the observed runaway cache and compilation queue.

## Phases

1. Update the development script in `package.json`.
2. Stop the current repository-owned Next.js dev process and remove the generated `.next` directory.
3. Start `npm run dev` and confirm it uses Webpack.
4. Verify admin, wallet, and Stripe checkout route compilation and response latency.
5. Run lint, TypeScript, and focused wallet/user-management tests.

## Verification

- Confirm `npm run dev` starts successfully on port 3000 with Webpack.
- Request `/admin/users` and `/customer/wallet` repeatedly and record response times.
- POST an unauthenticated, non-mutating probe to `/api/stripe/create-checkout`; confirm a prompt `401` rather than a compilation timeout.
- GET `/api/admin/users?page=1&pageSize=15`; confirm a prompt `401` rather than a compilation timeout.
- Check the new dev process CPU and RSS after the route probes.
- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run focused user-management and wallet tests.
- Run `git diff --check`.

## Results

- Clean Webpack dev startup completed in 230 ms.
- Cold `/admin/users` response completed in 1.40 s; warm responses completed in 23–173 ms.
- Cold unauthenticated `/api/stripe/create-checkout` compilation and response completed in 0.60 s; warm responses completed in 6–7 ms with the expected `401`.
- Cold unauthenticated `/api/admin/users?page=1&pageSize=15` compilation and response completed in 0.22 s with the expected `401`.
- Generated `.next` size after verification was 120 MB rather than the previous 2.7 GB Turbopack directory.
- Server RSS after route probes was approximately 1.96 GB rather than the previous approximately 12 GB runaway process.
- `npm run lint` exited successfully with 0 errors and 56 pre-existing warnings.
- `npx tsc --noEmit` exited successfully.
- Four focused test files passed with 9 tests.
- The full Vitest suite passed: 414 files and 1,766 tests, with 7 files and 20 tests skipped.
- `git diff --check` passed.
