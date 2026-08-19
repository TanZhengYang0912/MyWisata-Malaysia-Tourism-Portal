# AGENTS.md

## Project

MyWisata - Malaysia Tourism Portal
Tech Stack:
- Next.js 16 App Router
- TypeScript
- Supabase
- TailwindCSS

---

## Before Any Coding

Before making any code changes:

1. Read docs/requirements.md.
2. Read any relevant documentation under /docs.
3. Search for existing implementations before creating new ones.
4. Produce an implementation plan.
5. Wait for approval unless explicitly instructed to proceed.

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
- Use existing design tokens.
- Keep changes minimal.
- Preserve existing coding style.

Never:

- Refactor unrelated code.
- Rename files.
- Move folders.
- Introduce new patterns.
- Change formatting unnecessarily.
- Rewrite working code.

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

### Luna Worker Join Barrier

When a `luna_worker` result is required before implementation or final
verification can continue, mark the delegation as **BLOCKING**.

For a **BLOCKING** delegation:

1. Assign `luna_worker` one exclusive, bounded scope with explicit files,
   responsibilities, output requirements, and a timebox.
2. The main agent must not inspect, edit, test, implement, or independently
   review the same scope while `luna_worker` is running.
3. The main agent may continue only work that is explicitly disjoint from the
   delegated scope.
4. Before beginning dependent work or claiming completion, the main agent must
   wait until `luna_worker` returns its final result.
5. A timeout does not authorize a concurrent fallback. Request status once,
   then either continue waiting or interrupt `luna_worker`.
6. The main agent may take ownership of the delegated scope only after
   `luna_worker` has been interrupted or has otherwise stopped.
7. Never allow `luna_worker` and the main agent to execute the same task or
   fallback concurrently.
8. Unless explicitly authorized, `luna_worker` must perform one bounded pass,
   must not spawn additional subagents, and must return confirmed findings,
   affected files, verification performed, and blockers.

For a non-blocking delegation, give `luna_worker` an independent scope and a
clear handoff point. The main agent may work in parallel, but must still avoid
duplicating that scope and must collect the result before any dependent final
decision.

Suggested timeboxes are 10 minutes for a focused read-only review and 20
minutes for bounded test execution. Use a longer timebox only when the task
itself clearly requires it, and state that reason before delegation.

---

## Documentation

Architecture:
docs/architecture.md

Authentication:
docs/auth.md

Database:
docs/database.md

Testing:
docs/testing.md

Coding Standards:
docs/coding-standards.md

Prompt Rules:
docs/ai-guidelines.md

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
