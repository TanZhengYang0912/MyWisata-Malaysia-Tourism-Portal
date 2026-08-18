# SDD ledger — plan: Docs/plans/2026-08-17-2344-sitewide-cookie-i18n.md

Task 1: minor (deferred): namespace-specific config loader currently materializes all five namespaces before returning one; consider caching or a narrower loader only if profiling later justifies it.
Task 1: minor (deferred): locale tests could add q=0, quality-ordering, and Traditional Chinese rejection cases.
Task 1: complete (commits 21aa7cf..d534347, review clean)
Task 2: minor (deferred): migration privacy test verifies the new migration does not create a public view, but does not independently audit every pre-existing public view/grant; the committed migration itself exposes none.
Task 2: fix round 1/5 (1 addressed, 0 open — null JSON now returns 400; commits 058eac0..6b5d6a4)
Task 2: complete (commits d534347..6b5d6a4, review clean)
Task 3: minor (deferred): proxy preservation tests could later add multiple/chunked auth cookies, full cookie options, and forwarded refreshed request-cookie assertions.
Task 3: minor (deferred): AppI18nProvider initializes a private i18next instance in a lazy state initializer; no race observed, but keep this lifecycle under browser acceptance coverage.
Task 3: fix round 1/5 (production resource hydration and English fallback addressed; commit 4983245..b132f1b; test evidence remained open)
Task 3: fix round 2/5 (runtime test and genuine mutation RED addressed; commit b132f1b..21b2107; 0 open)
Task 3: complete (commits 6b5d6a4..21b2107, review clean)
Task 4: minor (deferred): native language labels intentionally also exist in common resources per the plan's parity contract; keep LANGUAGE_OPTIONS as the runtime native-label source.
Task 4: minor (deferred): translate notification-bell shell copy in Task 5, which owns that component.
Task 4: fix round 1/5 (behavior tests, JSX placement, guest/admin copy, responsive guest controls, semantic customer nav keys addressed; commit 6b0f03d..fb69204; login entry copy remained open)
Task 4: fix round 2/5 (login entry-point literals addressed; commit fb69204..21aef1c; 0 open)
Task 4: complete (commits 21b2107..21aef1c, review clean)
Task 5: minor (deferred): stringly typed optional display-string translation in EmptyState/ConfirmDialog could accidentally match a key; retain current compatibility until typed consumer migrations justify tightening.
Task 5: minor (deferred): ChatbotWidget integration test emits one non-blocking React act warning from asynchronous state updates.
Task 5: fix round 1/5 (status prototype safety, API error preservation, broad runtime/key coverage, formatter style/invalid date addressed; commit afe41d4..6b14b2c; chatbot handler coverage remained open)
Task 5: fix round 2/5 (real ChatbotWidget send/ticket flow covered; commit 6b14b2c..d8305a0; 0 open)
Task 5: complete (commits 21aef1c..d8305a0, review clean)
Task 6: minor (deferred): programmatic-only phone OTP helper/raw Zod edge-case messages remain outside rendered Task 6 scope; revisit only if they become user-visible.
Task 6: fix round 1/5 (direct dev children, stable/localized vendor validation, invite category specificity addressed; commit c0f8fa2..63cdfb4; 0 open)
Task 6: complete (commits d8305a0..63cdfb4, review clean)
Task 7: in progress (base 63cdfb4)
Task 7: fix round 1/5 (semantic key mismatches, invalid namespaces, weak inventory contract, locale-aware dates, safe staging addressed; commit 63cdfb4..43c7744; 0 open must-fix findings)
Task 7: follow-up (dirty-worktree-only customer pages retain pre-existing mixed business hunks and are intentionally not absorbed into the focused commit)
Task 7: complete (commits 63cdfb4..43c7744, focused review repaired, 332/332 regressions passing)
Task 8: in progress (base 43c7744)
Task 8: fix round 1/5 (high-risk route fixed-copy gaps, stronger contract coverage, localized source-contract assertions addressed; commit 43c7744..c9f9e8f; 0 open must-fix findings)
Task 8: complete (commits 43c7744..c9f9e8f, 56/56 contract and 207/207 regressions passing)
Task 9: in progress (base c9f9e8f)
Task 9: implementation complete pending focused review (admin contract 11/11, regressions 47/47, 1,285 admin keys merged without conflicts)
Task 9: fix round 1/1 (missing chatbot result keys, untranslated locale values, locale-aware date/amount/age formatting, translated withdrawal enums, and wallet save label addressed; 0 open must-fix findings)
Task 9: complete pending commit (1,364/1,364 locale keys, contract/resources 14/14, admin regressions 48/48, TypeScript pass, ESLint 0 errors)
Task 9: focused repair re-review clean (6/6 confirmed findings closed, 0 open must-fix findings)
