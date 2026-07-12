# ADR-015: Separate browser contexts for multi-role Playwright tests

**Status:** Accepted

## Decision

Playwright e2e tests that exercise more than one user role (e.g., customer + admin) use separate `browser.newContext()` instances for each role rather than a single shared context or separate browser instances.

## Rationale

Supabase session cookies are stored per browser context. A single shared context allows only one active session at a time — logging in as admin overwrites the customer session, causing subsequent customer-side assertions to execute as admin (or fail with 401). Separate contexts maintain independent cookie jars, so both sessions coexist. Separate `browser.launch()` instances were also considered but consume more memory and require explicit IPC between processes; separate contexts within the same browser process share no overhead and allow the test to coordinate steps without inter-process communication. This pattern is required for any test that asserts a cause (admin action) and its effect (customer balance change) in the same run.
