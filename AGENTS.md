# AGENTS.md

## Project

MYLawatan - Malaysia Tourism Portal
Tech Stack:
- Next.js 16 App Router
- TypeScript
- Supabase
- TailwindCSS

---

## Before Any Coding

Before making any code changes:

1. Inventory the real documentation available under `docs/`.
2. Read the relevant existing ADRs, research, audits, and plans. Do not assume a
   named document exists; report a missing referenced document once and continue
   with the available repository evidence.
3. Search for existing implementations before creating new ones.
4. Produce an implementation plan.
5. Wait for approval unless explicitly instructed to proceed.

---

## Existing Implementation First

Before recommending or implementing a new feature, flow, page, or component:

1. Perform a read-only inventory of the relevant routes, components, APIs,
   database flow, tests, and documentation.
2. Tell the user what already exists, what can be reused, and what is genuinely
   missing before recommending whether new implementation is necessary.
3. Prefer exposing, connecting, or extending an existing implementation over
   creating a duplicate implementation.
4. Do not describe functionality as missing until the repository search has
   confirmed that it does not already exist.

Treat requests such as "do not implement yet" or "do not execute yet" as a
restriction on writes, not on read-only investigation, unless the user also
explicitly asks not to inspect. The user should not need to prompt the agent to
discover and explain existing implementations first.

---

## Communication and Decisions

- For repository questions, inspect the relevant routes, components, APIs,
  database flow, tests, and documentation before giving a conclusion. Do not
  answer from a partial scan when the user asks for a check or explanation.
- Lead with a clear conclusion based on what was verified. Then briefly state
  what already exists, what can be reused, and what is genuinely missing.
- List only the unresolved decisions or uncertainties that could materially
  change the behavior, scope, data model, or user experience.
- If the user's intent is unclear, state the most likely interpretation and ask
  a focused clarifying question before implementing. Do not silently make a
  consequential product or architecture decision. When useful, recommend a
  default and clearly label it as a recommendation, not as the user's decision.
- Do not ask for confirmation when the request and applicable project
  instructions already make the decision clear; proceed within the authorized
  scope.

---

## Mandatory Reuse Gate

This gate applies to every feature, UI change, refactor, and bug fix. Requests
mentioning "reuse", "same", "consistent", or "similar" make this gate especially
important.

Before writing a plan or modifying code:

1. Search for reuse at every layer, not only for an exact component:
   - route-local implementations
   - domain components
   - `components/admin`
   - `components/shared`
   - `components/ui`
   - design tokens and shared class names
   - formatting, validation, and data-conversion helpers
   - tests that define an existing UI or behavior contract
2. Produce a concise **Reuse Audit** containing:
   - candidate
   - exact file path
   - what can be reused
   - decision: reuse, extend, or reject
   - reason for every rejected candidate
3. Do not conclude that something is missing merely because an exact component
   does not exist. Continue searching for lower-level primitives, tokens, helpers,
   and behavior that can be composed.
4. Every implementation plan must contain a **Reuse Decisions** section. A plan
   without this section is incomplete.
5. Creating a new shared component requires repository-search evidence that:
   - no suitable implementation already exists;
   - extending an existing component would be inappropriate; and
   - at least two concrete consumers exist, or the user explicitly requested a
     reusable abstraction.
6. If "keep changes minimal" conflicts with reuse, prefer existing primitives and
   tokens unless reuse would change behavior, accessibility, or domain rules.
7. Even when the user says "execute directly" or "do not write a plan", do not
   skip the read-only reuse audit. Report it briefly in commentary, then execute.
8. When adding a file under an exact component inventory contract, update that
   contract and its tests in the same change.

The reuse search is complete only after the agent states **Reuse audit complete**
and provides the decisions above.

---

## Implementation Plan

The plan must include:

- Exact files to modify
- Exact functions/components affected
- Scope boundaries
- Files NOT being touched
- New dependencies
- Database changes
- Risks

---

## Coding Rules

Always:

- Follow the existing architecture.
- Reuse existing code.
- Reuse existing UI components (buttons, inputs, cards, back links, and other
  shared primitives) instead of building new look-alikes. Consistency first.
  See `docs/coding-standards.md` → "Reuse existing UI components".
- Use layout to explain controls; remove redundant visible labels and descriptions while preserving accessible names.
- Use existing design tokens.
- Keep changes minimal.
- Preserve existing coding style.
- Design Supabase reads for growth: select only needed fields; push filters,
  ordering, aggregation, and bounded pagination into the database where the
  semantics allow it; use key-based lookups for single records. Avoid loading a
  growing collection into application memory for filtering, slicing, or counting,
  and avoid per-row N+1 and duplicate/serial queries.
- Document intentional broad reads (for example, a recommendation candidate
  pool), filter and bound them at the database layer where possible, and do not
  paginate before ranking when that would change the result. Preserve RLS and
  ownership checks; validate index changes against query evidence rather than
  applying Advisor suggestions blindly. See `docs/coding-standards.md` →
  "Database Reads and Query Efficiency".

Never:

- Refactor unrelated code.
- Rename files.
- Move folders.
- Introduce new patterns.
- Change formatting unnecessarily.
- Rewrite working code.

## Practical Coding Standards

- Use 2 spaces for JavaScript, TypeScript, JSON, CSS, YAML, and SQL; use 4 spaces for Python. Preserve LF endings and a final newline.
- Prefer domain-specific names; use `is`/`has`/`can` for booleans and action names for functions. Prefix intentionally unused parameters or destructured values with `_`.
- Keep TypeScript strict. Model API and database boundaries with explicit types; use `unknown` with narrowing instead of `any`.
- Validate untrusted input at route and service boundaries. Catch errors where they can be recovered or translated; preserve diagnostic context and never silently discard failures.
- Add comments for domain invariants, security boundaries, compatibility constraints, and non-obvious side effects. Skip comments that restate the next line.
- In React, derive render state where practical, keep effect dependencies complete, and use Next.js navigation APIs for internal navigation.
- Add focused tests for observable behavior and regressions, especially authorization, money, and state transitions; prefer outcome assertions over source-shape assertions.
- Keep SQL changes in migrations, preserve existing data, and document non-obvious constraints or backfills. Validate script targets and fail before destructive work when required inputs are missing.
- Keep edits local; do not reformat unrelated files to make them match these rules.

---

## Investigation Mode

If asked to:

- review
- audit
- inspect
- explain
- analyze

DO NOT modify code.

Only produce findings.

---

## Bug Fixing

Before fixing:

1. Find the root cause.
2. Explain it.
3. Propose the smallest fix.

Do not patch symptoms.

---

## Verification

Before finishing:

Run if possible:

- npm run lint
- npx tsc --noEmit
- affected tests

If unable, explain why.

---

## Commit Message

After implementing a plan or any code change, end the final chat reply with a
commit message the user can copy (the user commits; never run git commit):

```text
<Summary: one line, English, imperative, max 70 characters>

<Description: 2-4 sentences: why the change was made and what it does now.
No file lists; the diff shows those.>
```

---

## Execution Timebox and Review Stop Rules

Keep implementation and verification proportionate to the risk. Do not allow
an open-ended review/fix/re-review loop to turn a bounded task into a
multi-hour or overnight run.

- Classify review findings as **must fix before handoff** or **follow-up**.
- Must-fix findings are limited to confirmed security, privacy, data-loss,
  authorization, broken core flow, or clear requirement violations.
- Record non-blocking edge cases, polish, and speculative improvements as
  follow-up work; do not repeatedly implement and re-review them in the same
  task unless the user explicitly asks.
- Before each additional repair cycle, state the concrete blocking risk and
  verify that the fix is still within the approved scope.
- Use at most one focused re-review after a repair. Escalate to the user
  rather than continuing repeated review cycles when further findings are not
  clearly blocking.
- Do not run broad suites or browser flows more than once after the final
  code change unless a failed verification or a user request requires a rerun.
- Give a progress update before any wait longer than a few minutes, and do
  not leave a task running unattended across user sessions without explicit
  authorization.

### Execution Strategy

For a well-specified feature or bug fix whose changes are in one connected
area, prefer **Inline Execution**: implement, test, and verify continuously in
the current workspace. Do not split ordinary implementation into a chain of
worker, report, commit, reviewer, and re-review cycles.

Use `luna_worker` only for bounded, independent work that benefits from a
fresh read-only perspective, especially permission checks, privacy audits,
sensitive-data exposure checks, and signed URL or storage-path verification.

For normal implementation, use one focused final review after the code and
tests are ready. Use additional review cycles only for a confirmed must-fix
risk under the rules above.

---

## Documentation

The repository's documentation root is `docs/`. Inventory it before relying on a
specific filename. Relevant maintained material currently lives in:

- `docs/adr/` — architecture and security decisions
- `docs/audits/` — completed audits
- `docs/research/` — implementation research
- `docs/plans/` — approved, active, and deferred implementation plans

Do not fabricate or duplicate missing `requirements.md`, `architecture.md`,
`auth.md`, `database.md`, `testing.md`, `coding-standards.md`, or
`ai-guidelines.md` files. Use the existing evidence and note genuine documentation
gaps in the implementation plan when relevant.

For quick routing, the maintained documents currently include:

- Requirements: `docs/requirements.md`
- Architecture: `docs/architecture.md`
- Database: `docs/database.md`
- Testing: `docs/testing.md`
- Coding Standards: `docs/coding-standards.md`
- Prompt Rules: `docs/ai-guidelines.md`
- Full QA audit: `docs/qa-audit.md`

There is currently no maintained `docs/auth.md`; use the existing authentication
ADRs, research, and implementation evidence instead of inventing that file.

Full QA audit rule:

Only when the user explicitly asks to "run a full testing", "run a full QA
audit", or requests release-readiness testing, read and follow
`docs/qa-audit.md`. Do not load that document for ordinary feature work or
routine test runs.

---

## Plans

All plans live in `docs/plans/`.

Never write plans to `~/.claude/plans/` — that directory is global and mixes
plans from other projects. It is scratch only.

### File naming

    YYYY-MM-DD-HHMM-objective.md

Examples:

    2026-07-23-1459-product-outlet-cart-model.md
    2026-07-23-0157-server-architecture-refactor.md

Date and time are when the plan was created. Keep them fixed when editing —
do not rename on update. Objective is short, kebab-case, and names the
outcome, not the phase.

### One plan, one file

Do not split design and implementation into separate documents. Each plan
contains both:

1. Context — why this change, what problem it solves
2. Decisions — what was agreed, and what is explicitly out of scope
3. Phases — ordered lowest-risk first, with files to modify
4. Verification — how to prove each phase works

Deferred plans stay in `docs/plans/` with their status marked at the top.

---

## Sample UI

For UI/UX questions, the user prefers a visual HTML example over a text-only
description when a mockup would make the proposal easier to understand. Offer or
create a self-contained HTML sample when useful; label unresolved assumptions
and do not treat a sample as approval to change the application. Keep using the
sample rules below.

When asked to show a sample UI, mockup, or UI option:

1. Output a single self-contained HTML file (inline CSS/JS, images embedded as
   data URIs).
2. Open it directly in the user's default browser with `open <file>.html`.
   Never use the in-app browser/preview pane for samples.
3. Do not add sample files to the repo unless asked; keep them in the scratchpad.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
