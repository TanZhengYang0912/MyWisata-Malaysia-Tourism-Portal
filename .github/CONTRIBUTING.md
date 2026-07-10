# Contributing Guide

## Branch Strategy

```
main        ← protected, push only via PR from develop
develop     ← integration branch — merge here daily
feature/*   ← your working branch
```

### Branch naming
```
feature/P1-auth
feature/P1-chat
feature/P2-catalogue
feature/P2-slots
feature/P3-discovery
feature/P3-map
feature/P4-cart
feature/P4-wallet
```

## Daily Workflow

```bash
# Start of day — sync with latest develop
git checkout develop
git pull origin develop
git checkout feature/P{N}-{module}
git rebase develop

# Work → commit small and often
git add src/app/(customer)/...
git commit -m "feat(P3/C1): add category filter chips"

# End of day — merge to develop
git checkout develop
git merge feature/P{N}-{module}
git push origin develop
```

## Commit Message Format

```
feat(P{N}/{sub}): short description
fix(P{N}/{sub}): what was broken
chore: dependency/config change

# Examples:
feat(P1/A1): add demo account switcher to login page
feat(P4/D1): implement voucher validation in checkout
fix(P2/B2): correct product slug uniqueness constraint
```

## Before Opening a PR

1. `npm run type-check` — must pass (zero TypeScript errors)
2. `npm run lint` — must pass
3. Run `supabase db reset` locally — app must still work from clean seed
4. Fill out the PR template completely

## Database Rules

- **Never modify a migration file that has already been pushed to `develop`**
- For schema changes: create a NEW migration file (`002_...`, `003_...`)
- Only write migrations for tables listed in `docs/module-ownership.md` under YOUR member number
- All `NUMERIC` fields for money: `NUMERIC(12,2)` — and always use `money.ts` in code

## Shared Contract Rules

- `src/lib/money.ts` — any change requires ALL members to review
- `src/types/index.ts` — notify team in group chat before changing
- `src/lib/constants.ts` — must match DB CHECK constraints exactly
- API route contracts (`/api/cart`, `/api/orders`) — agree on request/response shape in group chat first

## Code Review Checklist

- [ ] Only modifies tables listed under their member number in `docs/module-ownership.md`
- [ ] All money arithmetic goes through `money.ts`
- [ ] All approve/reject actions call `auditAndNotify()`
- [ ] No hardcoded user IDs or prices
- [ ] "DEMO" / "Mock" labels on any simulated functionality
- [ ] No PII logged to console
