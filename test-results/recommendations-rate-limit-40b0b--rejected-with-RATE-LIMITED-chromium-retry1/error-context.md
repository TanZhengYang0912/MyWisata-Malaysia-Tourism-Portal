# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recommendations-rate-limit.spec.ts >> Recommendation rate limit (PR 019) >> 6th submission within 24 h is rejected with RATE_LIMITED
- Location: tests\e2e\recommendations-rate-limit.spec.ts:15:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/email/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - img [ref=e6]
      - generic [ref=e9]: MyWisata
    - generic [ref=e11]:
      - heading "Choose a demo account" [level=1] [ref=e12]
      - paragraph [ref=e13]: Sign in with Supabase Auth, or use a seeded account for the prototype walkthrough.
      - generic [ref=e14]:
        - paragraph [ref=e15]: Account sign in
        - textbox "Email" [ref=e16]
        - textbox "Password" [ref=e17]
        - button "Sign in" [ref=e18]
      - paragraph [ref=e19]: Seeded demo accounts
      - generic [ref=e20]:
        - button "S Super Admin admin@demo.local Super Admin" [ref=e21]:
          - generic [ref=e22]: S
          - generic [ref=e23]:
            - paragraph [ref=e24]: Super Admin
            - paragraph [ref=e25]: admin@demo.local
          - generic [ref=e26]: Super Admin
        - button "D Diagnostic User approver@demo.local Customer" [ref=e27]:
          - generic [ref=e28]: D
          - generic [ref=e29]:
            - paragraph [ref=e30]: Diagnostic User
            - paragraph [ref=e31]: approver@demo.local
          - generic [ref=e32]: Customer
        - button "P Playwright Profile Complete customer@demo.local Customer" [ref=e33]:
          - generic [ref=e34]: P
          - generic [ref=e35]:
            - paragraph [ref=e36]: Playwright Profile Complete
            - paragraph [ref=e37]: customer@demo.local
          - generic [ref=e38]: Customer
        - button "C Customer Alice customer1@demo.local Customer" [ref=e39]:
          - generic [ref=e40]: C
          - generic [ref=e41]:
            - paragraph [ref=e42]: Customer Alice
            - paragraph [ref=e43]: customer1@demo.local
          - generic [ref=e44]: Customer
        - button "C Customer Bob customer2@demo.local Customer" [ref=e45]:
          - generic [ref=e46]: C
          - generic [ref=e47]:
            - paragraph [ref=e48]: Customer Bob
            - paragraph [ref=e49]: customer2@demo.local
          - generic [ref=e50]: Customer
        - button "C Customer Carol customer3@demo.local Customer" [ref=e51]:
          - generic [ref=e52]: C
          - generic [ref=e53]:
            - paragraph [ref=e54]: Customer Carol
            - paragraph [ref=e55]: customer3@demo.local
          - generic [ref=e56]: Customer
        - button "C Customer Dave customer4@demo.local Customer" [ref=e57]:
          - generic [ref=e58]: C
          - generic [ref=e59]:
            - paragraph [ref=e60]: Customer Dave
            - paragraph [ref=e61]: customer4@demo.local
          - generic [ref=e62]: Customer
        - button "O Outlet Manager Mei outlet.manager@demo.local Outlet Manager" [ref=e63]:
          - generic [ref=e64]: O
          - generic [ref=e65]:
            - paragraph [ref=e66]: Outlet Manager Mei
            - paragraph [ref=e67]: outlet.manager@demo.local
          - generic [ref=e68]: Outlet Manager
        - button "V Vendor Owner Ali vendor.owner@demo.local Vendor Owner" [ref=e69]:
          - generic [ref=e70]: V
          - generic [ref=e71]:
            - paragraph [ref=e72]: Vendor Owner Ali
            - paragraph [ref=e73]: vendor.owner@demo.local
          - generic [ref=e74]: Vendor Owner
    - paragraph [ref=e75]: Demo records are stored in Supabase. The browser is not used as the database.
  - button "Open Next.js Dev Tools" [ref=e81] [cursor=pointer]:
    - img [ref=e82]
  - alert [ref=e85]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Verifies the recommendation rate limit enforced by the submit_recommendation RPC
  5  |  * (advisory lock + 5/day count check — PR 019).
  6  |  *
  7  |  * Strategy: use page.request (same cookie jar as the browser session) to fire
  8  |  * 5 API calls fast, then attempt a 6th via the UI form to verify the error message.
  9  |  */
  10 | 
  11 | const CUSTOMER_EMAIL = 'customer@demo.local';
  12 | const CUSTOMER_PASS  = 'demo123456';
  13 | 
  14 | test.describe('Recommendation rate limit (PR 019)', () => {
  15 |   test('6th submission within 24 h is rejected with RATE_LIMITED', async ({ page }) => {
  16 |     // ── 1. Sign in ──────────────────────────────────────────────────────────
  17 |     await page.goto('/login');
> 18 |     await page.getByLabel(/email/i).fill(CUSTOMER_EMAIL);
     |                                     ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  19 |     await page.getByLabel(/password/i).fill(CUSTOMER_PASS);
  20 |     await page.getByRole('button', { name: /sign in|log in/i }).click();
  21 |     await page.waitForURL(/\/customer\//);
  22 | 
  23 |     // ── 2. Fire 5 submissions via API (same cookie jar = same auth session) ─
  24 |     // Using unique names to avoid duplicate detection
  25 |     const ts = Date.now();
  26 |     for (let i = 0; i < 5; i++) {
  27 |       const res = await page.request.post('/api/recommendations', {
  28 |         data: {
  29 |           vendorName:  `PW Test Vendor ${ts}-${i}`,
  30 |           description: 'Playwright test vendor for rate limit verification.',
  31 |           state:       'Selangor',
  32 |         },
  33 |       });
  34 |       // Accept success (201) or already-at-limit (429) — test may run
  35 |       // after earlier submissions exist in the same day.
  36 |       expect([201, 429]).toContain(res.status());
  37 |       if (res.status() === 429) {
  38 |         // Already hit limit from prior test run — skip to UI check.
  39 |         break;
  40 |       }
  41 |     }
  42 | 
  43 |     // ── 3. Attempt 6th via API — must be rate-limited ─────────────────────
  44 |     const sixthRes = await page.request.post('/api/recommendations', {
  45 |       data: {
  46 |         vendorName:  `PW Test Vendor ${ts}-OVER`,
  47 |         description: 'This 6th submission should be blocked by rate limit.',
  48 |         state:       'Johor',
  49 |       },
  50 |     });
  51 |     expect(sixthRes.status()).toBe(429);
  52 |     const body = await sixthRes.json();
  53 |     expect(body.error?.code ?? body.code ?? '').toMatch(/RATE_LIMITED/i);
  54 | 
  55 |     // ── 4. Navigate to recommendations page and verify UI error ───────────
  56 |     await page.goto('/customer/recommendations');
  57 |     await page.getByRole('button', { name: /recommend/i }).click();
  58 | 
  59 |     // Fill form
  60 |     await page.getByLabel(/vendor name/i).fill(`PW Test Vendor ${ts}-UI`);
  61 |     await page.getByLabel(/description/i).fill(
  62 |       'This submission should be blocked by the daily rate limit and show an error in the UI.',
  63 |     );
  64 |     // State might be a select or input
  65 |     const stateField = page.getByLabel(/state/i).first();
  66 |     if (await stateField.getAttribute('role') === 'combobox' || await stateField.evaluate(el => el.tagName) === 'SELECT') {
  67 |       await stateField.selectOption({ label: /Selangor/i });
  68 |     } else {
  69 |       await stateField.fill('Selangor');
  70 |     }
  71 | 
  72 |     await page.getByRole('button', { name: /submit recommendation/i }).click();
  73 | 
  74 |     // Expect rate-limit error to appear in UI
  75 |     await expect(
  76 |       page.getByText(/daily recommendation limit|try again tomorrow|rate.?limit/i)
  77 |     ).toBeVisible({ timeout: 5_000 });
  78 |   });
  79 | });
  80 | 
```