# Admin Recommendation Clickable Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed

**Goal:** Make each Admin Recommendation queue row a semantic link to its corresponding detail page, matching the Admin Withdrawal queue interaction.

**Architecture:** Keep the existing `AdminRecommendationsPage` data flow and layout. Replace each row-level `<article>` plus nested action link with one Next.js `Link`, and use a decorative `ArrowUpRight` cue so there are no nested interactive elements.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest

## Global Constraints

- Preserve the existing Admin page shell, filters, metrics, pagination, status badges, SLA indicator, contributor details, and assignee details.
- Do not modify Recommendation APIs, database migrations, detail-page review actions, Customer Recommendation pages, translations, or Withdrawal components.
- Reuse the Admin Withdrawal queue row hover, focus-visible, group, and arrow interaction classes.
- Add no dependencies and make no database changes.

## File Structure

- Modify `app/admin/recommendations/page.tsx`: owns the Admin Recommendation queue rendering and row navigation.
- Create `app/admin/recommendations/__tests__/page.contract.test.ts`: locks down semantic row navigation and prevents the old nested detail-button structure from returning.

## Scope Boundaries

- Function affected: `AdminRecommendationsPage`.
- Component affected: the `data.items.map` Recommendation queue row markup only.
- Files not touched: all API routes, `app/admin/recommendations/[id]/page.tsx`, `components/admin/recommendation-detail-view.tsx`, translations, shared Admin shell, and database files.
- New dependencies: none.
- Database changes: none.
- Main risk: invalid nested links or inaccessible click-only navigation; prevented by using one semantic `Link` per row.

---

### Task 1: Convert Recommendation queue rows into semantic links

**Files:**
- Create: `app/admin/recommendations/__tests__/page.contract.test.ts`
- Modify: `app/admin/recommendations/page.tsx`
- Test: `app/admin/recommendations/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: `RecommendationListItem.id`, `RecommendationListItem.name`, Next.js `Link`, and the existing `ui.actions.viewDetails` translation.
- Produces: one focusable row link with `href={\`/admin/recommendations/${r.id}\`}` and an accessible label for every Recommendation list item.

- [x] **Step 1: Write the failing contract test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/recommendations/page.tsx'),
  'utf8',
);

describe('admin recommendation queue row navigation', () => {
  it('uses one semantic detail link for the complete recommendation row', () => {
    expect(pageSource).toContain('aria-label={`${t("ui.actions.viewDetails")}: ${r.name}`}');
    expect(pageSource).toContain('className="group flex flex-wrap items-center gap-4 px-5 py-4');
    expect(pageSource).toContain('href={`/admin/recommendations/${r.id}`}');
  });

  it('uses a decorative arrow instead of a nested View details button', () => {
    expect(pageSource).toContain('<ArrowUpRight aria-hidden="true"');
    expect(pageSource).not.toContain('<Eye size={14} />');
    expect(pageSource).not.toContain('<Button asChild size="sm" variant="outline"><Link href={`/admin/recommendations/${r.id}`}');
  });
});
```

- [x] **Step 2: Run the contract test and confirm RED**

Run: `npx vitest run app/admin/recommendations/__tests__/page.contract.test.ts`

Expected: FAIL because the page still renders an `<article>` with a nested **View details** link and imports `Eye`.

- [x] **Step 3: Implement the minimal semantic row link**

In `app/admin/recommendations/page.tsx`, replace `Eye` with `ArrowUpRight` in the Lucide import. Replace each `<article>` and nested detail button with one `Link`:

```tsx
<Link
  key={r.id}
  href={`/admin/recommendations/${r.id}`}
  aria-label={`${t("ui.actions.viewDetails")}: ${r.name}`}
  className="group flex flex-wrap items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
>
  <div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold text-foreground">{r.name}</p><StatusBadge status={r.status} />
      {r.slaState !== "within_sla" && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t(`ui.recommendations.sla.${r.slaState}`, { hours: r.ageHours })}</span>}
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t("ui.recommendations.contributorLine", { category: r.category, state: r.state, author: r.author.name })}</span><VerifiedContributorBadge verified={r.author.isKycVerified} /></div>
    <p className="mt-1 text-xs text-muted-foreground">{r.assignee ? t("ui.recommendations.assignedTo", { name: r.assignee.name }) : t("ui.recommendations.unassigned")}</p>
  </div>
  <ArrowUpRight
    aria-hidden="true"
    size={16}
    className="text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
  />
</Link>
```

- [x] **Step 4: Run focused tests**

Run: `npx vitest run app/admin/recommendations/__tests__/page.contract.test.ts app/admin/recommendations/__tests__/pagination-ui.test.ts app/admin/recommendations/__tests__/detail-page.test.ts`

Expected: all focused tests PASS.

- [x] **Step 5: Run static verification**

Run: `npx eslint app/admin/recommendations/page.tsx app/admin/recommendations/__tests__/page.contract.test.ts`

Run: `npx tsc --noEmit`

Expected: both commands exit successfully with no new errors.

- [x] **Step 6: Browser verification**

Open `/admin/recommendations` and verify:

- Clicking the name, whitespace, status area, or arrow opens the matching detail route.
- Tab focuses the complete row and Enter opens the same detail route.
- Hover and focus styles match the Admin Withdrawal queue.
- Filters and pagination continue to work because they remain outside row links.

- [x] **Step 7: Commit the implementation**

Run: `git add app/admin/recommendations/page.tsx app/admin/recommendations/__tests__/page.contract.test.ts Docs/plans/2026-08-26-0209-admin-recommendation-clickable-row.md`

Run: `git commit -m "feat(recommendations): make admin queue rows clickable"`
