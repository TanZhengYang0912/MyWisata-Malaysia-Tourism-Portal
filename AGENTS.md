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