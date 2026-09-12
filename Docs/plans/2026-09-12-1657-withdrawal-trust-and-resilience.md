# Withdrawal Trust and Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow the repository's Inline Execution strategy because these changes form one connected withdrawal flow.

**Goal:** Bind TNG withdrawals to the authenticated customer's OTP-verified phone, restore explicit signed transaction amounts, make Wallet requests recover safely from latency, and add a tamper-resistant Gemini rejection-assistant step.

**Architecture:** Preserve the existing Wallet, payout destination, withdrawal approval, ledger, and settlement boundaries. Add one server-only TNG identity resolver shared by destination and withdrawal APIs, and one server-only moderation credential helper shared by review and rejection APIs. Extend the current customer Wallet and Admin withdrawal detail in place; do not add a second flow, database migration, global request framework, or production TNG claim.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript, Supabase, TailwindCSS, Gemini REST API, Node `crypto`, Vitest, Playwright.

**Design:** `Docs/superpowers/specs/2026-09-12-withdrawal-identity-assistant-resilience-design.md`

## Global Constraints

- Keep `npm run dev` on `next dev --webpack`; do not change bundler configuration.
- TNG identity comes only from the authenticated user's non-null `users.phone` with non-null `users.phone_verified_at`.
- The browser cannot submit a phone, DuitNow ID, provider reference, or identity override.
- Preserve Stripe behavior, withdrawal statuses, KYC, dual approval, balances, ledger writes, provider processing, signed callbacks, and settlement.
- Gemini prohibited content, unavailability, timeout, and rate limiting remain blocking; relevance and tone are advisory.
- Credit renders as `+RM50.00`; debit renders as `-RM50.00`; colour is supplementary.
- Add no package dependency or database migration.
- Preserve the user's unrelated checkout and multi-outlet migration changes.

## Reuse Decisions

| Candidate | Exact path | Decision | Reason |
| --- | --- | --- | --- |
| Destination API | `app/api/wallet/destinations/route.ts` | Extend | Already owns authentication, provider checks, masking, and service-only save. |
| Verified-phone parser | `lib/phone/international.ts` | Reuse | Validates the server-managed profile value as canonical E.164 before the TNG-specific Malaysian-mobile check. |
| TNG provider | `lib/payouts/providers/tng-direct-credit.ts` | Reuse | Already produces masks and opaque provider references from the validated phone. |
| Verified identity | `users.phone`, `users.phone_verified_at` | Reuse | Existing OTP flow makes these server-managed facts. |
| Withdrawal API | `app/api/wallet/withdrawals/route.ts` | Extend | Final authority before `submit_wallet_withdrawal`. |
| Customer Wallet | `app/customer/wallet/page.tsx` | Extend | Existing destination, readiness, submission, and refresh owner. |
| Transaction helper | `lib/wallet/transaction-display.ts` | Repair | Direction-based sign behavior existed and regressed. |
| Timeout pattern | `app/admin/wallet/settings/page.tsx` | Reuse pattern | Existing eight-second abort, cleanup, error, and Retry behavior. |
| Moderation boundary | `lib/moderation.ts`, `lib/wallet/moderation-guard.ts` | Extend | Existing structured Gemini result, timeout, rate limit, audit, and blocking policy. |
| Decision UI | `components/admin/withdrawal-review-detail.tsx` | Extend | Existing single-request category, note, confirmation, and stale-state owner. |
| HMAC pattern | `lib/tickets/tokens.ts` | Reuse pattern only | Ticket claims and fallback secret are inappropriate for Wallet decisions. |
| New global request framework/shared form | N/A | Reject | No second consumer justifies the abstraction. |
| Production TNG adapter | N/A | Reject | No reviewed production identity contract exists. |

**Reuse audit complete.**

---

### Task 1: Restore explicit signed Wallet amounts

**Files:**
- Modify: `lib/wallet/transaction-display.ts`
- Modify: `lib/wallet/__tests__/transaction-display.test.ts`
- Modify: `components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`

**Interfaces:**
- Consumes: `{ direction: string; amount: number }` and `formatMYR(number)`.
- Produces: `signedTransactionAmount(transaction): string` returning `+RM50.00` or `-RM50.00`.

- [ ] **Step 1: Write the failing signed-amount assertions**

```ts
it('formats credits with plus and debits with minus', () => {
  expect(signedTransactionAmount({ type: 'topup', direction: 'credit', amount: 50 })).toBe('+RM50.00');
  expect(signedTransactionAmount({ type: 'spend', direction: 'debit', amount: 12.3 })).toBe('-RM12.30');
  expect(signedTransactionAmount({ type: 'refund', direction: 'credit', amount: -7 })).toBe('+RM7.00');
});
```

Keep the component contract:

```ts
expect(source).toContain('signedTransactionAmount(transaction)');
expect(source).toContain('transaction.direction === "debit" ? "text-wallet-debit" : "text-foreground"');
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
npx vitest run lib/wallet/__tests__/transaction-display.test.ts components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts
```

Expected: the helper test fails because current output has no signs.

- [ ] **Step 3: Restore the helper**

```ts
export function signedTransactionAmount(transaction: AmountTransactionLike) {
  const sign = transaction.direction === "credit" ? "+" : "-";
  return `${sign}${formatMYR(Math.abs(transaction.amount))}`;
}
```

Do not change `formatMYR`, `text-wallet-debit`, or `customerVisibleTransactions`.

- [ ] **Step 4: Run the Step 2 command and verify GREEN**

Expected: both files pass with explicit signs and existing colours.

- [ ] **Step 5: Commit**

```bash
git add lib/wallet/transaction-display.ts lib/wallet/__tests__/transaction-display.test.ts components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts
git commit -m "fix: restore signed wallet transaction amounts"
```

### Task 2: Enforce a server-only verified TNG identity

**Files:**
- Create: `lib/payouts/tng-identity.ts`
- Create: `lib/payouts/__tests__/tng-identity.test.ts`
- Modify: `app/api/wallet/destinations/route.ts`
- Modify: `app/api/wallet/destinations/__tests__/route.test.ts`
- Modify: `app/api/wallet/withdrawals/route.ts`
- Modify: `app/api/wallet/withdrawals/__tests__/route.test.ts`

**Interfaces:**

```ts
export type VerifiedTngIdentity = { providerReference: string; maskedReference: string };
export type VerifiedTngIdentityResult =
  | { ok: true; identity: VerifiedTngIdentity }
  | { ok: false; code: 'PHONE_VERIFICATION_REQUIRED' | 'PAYOUT_PROVIDER_UNSUPPORTED' | 'PAYOUT_DESTINATION_UNAVAILABLE'; message: string; status: 403 | 422 | 503 };

export async function resolveVerifiedTngIdentity(
  db: SupabaseClient,
  userId: string,
  provider?: PayoutProvider,
): Promise<VerifiedTngIdentityResult>;

export function tngDestinationMatchesIdentity(
  providerReference: string | null | undefined,
  identity: VerifiedTngIdentity,
): boolean;
```

- [ ] **Step 1: Write failing identity-helper tests**

Test missing phone, unverified phone, database error, disabled provider, provider failure, and success:

```ts
expect(await resolveVerifiedTngIdentity(dbWith({ phone: null, phone_verified_at: null }), userId, provider))
  .toMatchObject({ ok: false, code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
expect(await resolveVerifiedTngIdentity(dbWith({ phone: '+60177143951', phone_verified_at: null }), userId, provider))
  .toMatchObject({ ok: false, code: 'PHONE_VERIFICATION_REQUIRED', status: 403 });
expect(await resolveVerifiedTngIdentity(dbWith({ phone: '+60 17-714 3951', phone_verified_at: '2026-09-12T00:00:00Z' }), userId, provider))
  .toEqual({ ok: true, identity: { providerReference: 'tng_dest_verified_phone', maskedReference: '+60•••3951' } });
expect(provider.verifyDestination).toHaveBeenCalledWith({ phoneOrDuitNow: '+60177143951' });
expect(tngDestinationMatchesIdentity('tng_dest_verified_phone', identity)).toBe(true);
expect(tngDestinationMatchesIdentity('tng_dest_other_phone', identity)).toBe(false);
```

Assert no result exposes the full phone.

- [ ] **Step 2: Run the helper test and verify RED**

```bash
npx vitest run lib/payouts/__tests__/tng-identity.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the resolver**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInternationalPhone } from '@/lib/phone/international';
import { createTngDirectCreditProvider } from '@/lib/payouts/providers/tng-direct-credit';
import type { PayoutProvider } from '@/lib/payouts/providers';

export async function resolveVerifiedTngIdentity(
  db: SupabaseClient,
  userId: string,
  provider: PayoutProvider = createTngDirectCreditProvider(),
): Promise<VerifiedTngIdentityResult> {
  const { data, error } = await db.from('users').select('phone,phone_verified_at').eq('id', userId).maybeSingle();
  if (error) return { ok: false, code: 'PAYOUT_DESTINATION_UNAVAILABLE', message: 'Unable to verify your payout identity', status: 503 };
  if (!data?.phone || !data.phone_verified_at) return { ok: false, code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify your account phone before adding a TNG eWallet', status: 403 };
  const parsedPhone = parseInternationalPhone(data.phone);
  if (!parsedPhone.ok || !/^\+601\d{8,9}$/.test(parsedPhone.e164)) return { ok: false, code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify a valid Malaysian mobile number before adding a TNG eWallet', status: 403 };
  if (!provider.isConfigured()) return { ok: false, code: 'PAYOUT_PROVIDER_UNSUPPORTED', message: 'TNG eWallet payouts are not configured yet', status: 422 };
  const verification = await provider.verifyDestination({ phoneOrDuitNow: parsedPhone.e164 });
  if (verification.status !== 'verified' || !verification.providerReference) return { ok: false, code: 'PAYOUT_DESTINATION_UNAVAILABLE', message: 'TNG could not verify your account phone', status: 503 };
  return { ok: true, identity: { providerReference: verification.providerReference, maskedReference: verification.maskedReference } };
}

export function tngDestinationMatchesIdentity(providerReference: string | null | undefined, identity: VerifiedTngIdentity) {
  return Boolean(providerReference) && providerReference === identity.providerReference;
}
```

Define the result types exactly as in **Interfaces**. Do not export `data.phone`.

- [ ] **Step 4: Add failing destination and withdrawal route tests**

Require an e-wallet POST with only `{ type: 'e_wallet' }` to save the resolver's opaque and masked references. Require this legacy payload to fail strict parsing and never call the save RPC:

```ts
const response = await POST(request({ type: 'e_wallet', phoneOrDuitNow: '0123456789' }));
expect(response.status).toBe(422);
expect(mocks.serviceRpc).not.toHaveBeenCalled();
```

For `GET`, return matching and mismatched TNG rows; require the mismatch to become `status: 'disabled'`, and assert output contains neither `provider_reference` nor the full phone.

For withdrawal submission require:

```ts
expect(mismatchedResponse.status).toBe(403);
await expect(mismatchedResponse.json()).resolves.toMatchObject({ error: { code: 'PAYOUT_DESTINATION_IDENTITY_MISMATCH' } });
expect(mocks.rpc).not.toHaveBeenCalledWith('submit_wallet_withdrawal', expect.anything());
```

Then make the reference match and require `submit_wallet_withdrawal` with `p_amount_sen: 5000` and the selected destination ID.

- [ ] **Step 5: Run route tests and verify RED**

```bash
npx vitest run app/api/wallet/destinations/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/route.test.ts
```

Expected: current API still accepts browser identity and does not recheck old destinations.

- [ ] **Step 6: Enforce identity in both APIs**

Use this strict schema:

```ts
const destinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('e_wallet'), label: z.string().trim().min(1).max(100).optional() }).strict(),
  z.object({ type: z.literal('bank_account'), label: z.string().trim().min(1).max(100).optional() }).strict(),
]);
```

For e-wallet POST, resolve identity and save its references. For GET, select `provider_reference` only server-side, resolve identity once, map mismatches to disabled, and return only:

```ts
return apiOk({
  destinations,
  capabilities,
  tngIdentity: identity.ok ? { maskedPhone: identity.identity.maskedReference } : null,
});
```

In withdrawal POST, include `provider_reference` in the selected destination query and enforce:

```ts
if (destination.dest_type === 'ewallet') {
  const identity = await resolveVerifiedTngIdentity(db, user.id);
  if (!identity.ok) return apiFail(identity.code, identity.message, identity.status);
  if (!tngDestinationMatchesIdentity(destination.provider_reference, identity.identity)) {
    return apiFail('PAYOUT_DESTINATION_IDENTITY_MISMATCH', 'This TNG destination is not bound to your verified account phone', 403);
  }
}
```

Keep ownership, provider-enabled, verification-status, cooldown, and Stripe checks.

- [ ] **Step 7: Run focused identity tests and verify GREEN**

```bash
npx vitest run lib/payouts/__tests__/tng-identity.test.ts app/api/wallet/destinations/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts
```

Expected: all pass with no full phone or provider reference in responses.

- [ ] **Step 8: Commit**

```bash
git add lib/payouts/tng-identity.ts lib/payouts/__tests__/tng-identity.test.ts app/api/wallet/destinations/route.ts app/api/wallet/destinations/__tests__/route.test.ts app/api/wallet/withdrawals/route.ts app/api/wallet/withdrawals/__tests__/route.test.ts
git commit -m "fix: bind TNG withdrawals to verified phone"
```

### Task 3: Replace arbitrary TNG input and bound Wallet reads

**Files:**
- Modify: `app/customer/wallet/page.tsx`
- Modify: `app/customer/wallet/__tests__/payout-destinations.test.ts`
- Modify: `app/customer/wallet/__tests__/transaction-history.contract.test.ts`
- Modify: `components/customer/wallet/customer-transaction-history.tsx`
- Modify: `components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx`
- Modify: `backend/domains/commerce.ts`
- Modify: `backend/domains/__tests__/customer-wallet-history.test.ts`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`

**Interfaces:**
- Consumes: `tngIdentity: { maskedPhone: string } | null` from Task 2.
- Produces:

```ts
export async function getMyWithdrawals(userId: string, signal?: AbortSignal): Promise<WithdrawalRequest[]>;
export async function getCustomerWalletTransactionPage(
  userId: string,
  filters: CustomerHistoryFilters,
  signal?: AbortSignal,
): Promise<{ transactions: WalletTransaction[]; total: number }>;
```

- [ ] **Step 1: Add failing UI identity contracts**

```ts
expect(page).toContain('tngIdentity');
expect(page).toContain('body: JSON.stringify({ type: "e_wallet" })');
expect(page).toContain('tCustomer("ui.wallet.verifiedTngPhone"');
expect(page).toContain('href="/customer/phone"');
expect(page).not.toContain('phoneOrDuitNow');
expect(page).not.toContain('tngIdentifier');
expect(page).not.toContain('id="tng-destination"');
expect(page).not.toContain('normalizeTngDestinationIdentifier');
```

- [ ] **Step 2: Add failing timeout and Retry contracts**

```ts
expect(page).toContain('const WALLET_READ_TIMEOUT_MS = 8_000');
expect(page).toContain('new AbortController()');
expect(page).toContain('signal: controller.signal');
expect(page).toContain('tCustomer("ui.wallet.retryWallet")');
expect(historySource).toContain('getCustomerWalletTransactionPage(userId, filters, controller.signal)');
expect(historySource).toContain('window.setTimeout(() => controller.abort(), WALLET_READ_TIMEOUT_MS)');
```

- [ ] **Step 3: Run UI contracts and verify RED**

```bash
npx vitest run app/customer/wallet/__tests__/payout-destinations.test.ts app/customer/wallet/__tests__/transaction-history.contract.test.ts components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx
```

Expected: editable TNG input remains and reads have no timeout state.

- [ ] **Step 4: Thread optional abort signals through commerce queries**

Update `getMyWithdrawals` without changing its filters:

```ts
export async function getMyWithdrawals(userId: string, signal?: AbortSignal): Promise<WithdrawalRequest[]> {
  let query = supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as WithdrawalRow[]).map(mapWithdrawal);
}
```

In `getCustomerWalletTransactionPage`, apply the optional signal to the final wallet, order, and refund builders before `Promise.all`. Omission must preserve vendor Wallet and existing test behavior.

- [ ] **Step 5: Replace the TNG input with verified-phone display**

```ts
const [tngIdentity, setTngIdentity] = useState<{ maskedPhone: string } | null>(null);
```

Load `body.data?.tngIdentity ?? null` and create with:

```ts
body: JSON.stringify({ type: "e_wallet" }),
```

When identity exists render:

```tsx
<p className="text-sm font-semibold text-foreground">
  {tCustomer("ui.wallet.verifiedTngPhone", { phone: tngIdentity.maskedPhone })}
</p>
<p className="text-xs text-muted-foreground">{tCustomer("ui.wallet.tngIdentityLocked")}</p>
```

When absent render the existing `Button` as a link to `/customer/phone` using `verifyPhoneForTng`. Remove identifier state, input, handlers, placeholders, and normalization import.

- [ ] **Step 6: Add bounded reads and local Retry**

Add:

```ts
const WALLET_READ_TIMEOUT_MS = 8_000;
const [walletLoadError, setWalletLoadError] = useState("");
```

Create a `loadWallet` callback for initial load and Retry. Give destination loading an eight-second controller. Once its default destination is known, call `refreshWalletState(nextDestinationId)`; inside that callback run summary and withdrawal reads with independent eight-second controllers through `Promise.allSettled`. Clear every timer in `finally`, update fulfilled sections only, retain previously loaded data for rejected sections, and set `walletLoadError` when any section rejects. This preserves partial rendering while avoiding one slow request cancelling unrelated data.

Render:

```tsx
{walletLoadError && (
  <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <p>{walletLoadError}</p>
    <Button type="button" variant="outline" className="mt-3" onClick={() => void loadWallet()}>
      {tCustomer("ui.wallet.retryWallet")}
    </Button>
  </div>
)}
```

In transaction history use:

```ts
const controller = new AbortController();
const timeout = window.setTimeout(() => controller.abort(), WALLET_READ_TIMEOUT_MS);
getCustomerWalletTransactionPage(userId, filters, controller.signal)
  .then((page) => { if (active) setResult({ key: requestKey, ...page, failed: false }); })
  .catch(() => { if (active) setResult({ key: requestKey, transactions: [], total: 0, failed: true }); })
  .finally(() => window.clearTimeout(timeout));
return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
```

- [ ] **Step 7: Add exact customer copy**

Add under `ui.wallet` in all three locale files:

```jsonc
// en
{"verifiedTngPhone":"Verified TNG phone: {{phone}}","tngIdentityLocked":"For your protection, TNG withdrawals can only use your OTP-verified account phone.","verifyPhoneForTng":"Verify your phone to use TNG","walletLoadError":"Some Wallet information took too long to load.","retryWallet":"Retry Wallet loading","confirmingWithdrawal":"The request timed out. We are confirming whether it was received.","withdrawalOutcomeUnknown":"We could not confirm the request yet. Review your withdrawal list before trying again."}
// ms
{"verifiedTngPhone":"Telefon TNG disahkan: {{phone}}","tngIdentityLocked":"Untuk perlindungan anda, pengeluaran TNG hanya boleh menggunakan telefon akaun yang disahkan melalui OTP.","verifyPhoneForTng":"Sahkan telefon anda untuk menggunakan TNG","walletLoadError":"Sebahagian maklumat Wallet mengambil masa terlalu lama untuk dimuatkan.","retryWallet":"Cuba muatkan Wallet semula","confirmingWithdrawal":"Permintaan tamat masa. Kami sedang mengesahkan sama ada permintaan telah diterima.","withdrawalOutcomeUnknown":"Kami belum dapat mengesahkan permintaan. Semak senarai pengeluaran sebelum mencuba lagi."}
// zh-CN
{"verifiedTngPhone":"已验证的 TNG 手机号：{{phone}}","tngIdentityLocked":"为保障资金安全，TNG 提现只能使用当前账号经 OTP 验证的手机号。","verifyPhoneForTng":"验证手机号以使用 TNG","walletLoadError":"部分钱包资料加载时间过长。","retryWallet":"重新加载钱包","confirmingWithdrawal":"请求已超时，系统正在确认是否已收到申请。","withdrawalOutcomeUnknown":"暂时无法确认申请结果。再次尝试前，请先检查提现记录。"}
```

Remove obsolete `invalidTngIdentifier`, `tngIdentifier`, and `tngPlaceholder` only after `rg` confirms no consumers.

- [ ] **Step 8: Run focused customer tests and verify GREEN**

```bash
npx vitest run app/customer/wallet/__tests__/payout-destinations.test.ts app/customer/wallet/__tests__/transaction-history.contract.test.ts components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx backend/domains/__tests__/customer-wallet-history.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts
```

Expected: no identifier input is rendered and read failures become retryable.

- [ ] **Step 9: Commit**

```bash
git add app/customer/wallet/page.tsx app/customer/wallet/__tests__/payout-destinations.test.ts app/customer/wallet/__tests__/transaction-history.contract.test.ts components/customer/wallet/customer-transaction-history.tsx components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx backend/domains/commerce.ts backend/domains/__tests__/customer-wallet-history.test.ts app/i18n/locales/en/customer.json app/i18n/locales/ms/customer.json app/i18n/locales/zh-CN/customer.json
git commit -m "feat: harden customer withdrawal experience"
```

### Task 4: Reconcile ambiguous submission timeouts

**Files:**
- Create: `lib/wallet/withdrawal-reconciliation.ts`
- Create: `lib/wallet/__tests__/withdrawal-reconciliation.test.ts`
- Modify: `app/customer/wallet/page.tsx`
- Modify: `app/customer/wallet/__tests__/stripe-jit.test.ts`

**Interfaces:**

```ts
export function findSubmittedWithdrawal(
  withdrawals: WithdrawalRequest[],
  input: { amountSen: number; submittedAtMs: number; clockSkewMs?: number; outcomeWindowMs?: number },
): WithdrawalRequest | null;
```

- [ ] **Step 1: Write failing reconciliation tests**

Use old RM50, recent RM70, and recent RM50 requests:

```ts
expect(findSubmittedWithdrawal(withdrawals, { amountSen: 5000, submittedAtMs })).toMatchObject({ id: 'recent-50' });
expect(findSubmittedWithdrawal(withdrawals, { amountSen: 5100, submittedAtMs })).toBeNull();
```

Require invalid dates, unsafe/non-positive sen amounts, requests older than the clock-skew allowance, and requests beyond the bounded future outcome window to return `null`.

- [ ] **Step 2: Run the test and verify RED**

```bash
npx vitest run lib/wallet/__tests__/withdrawal-reconciliation.test.ts
```

Expected: module missing.

- [ ] **Step 3: Implement deterministic matching**

```ts
export function findSubmittedWithdrawal(
  withdrawals: WithdrawalRequest[],
  input: { amountSen: number; submittedAtMs: number; clockSkewMs?: number; outcomeWindowMs?: number },
) {
  if (!Number.isSafeInteger(input.amountSen) || input.amountSen <= 0 || !Number.isFinite(input.submittedAtMs)) return null;
  const earliest = input.submittedAtMs - (input.clockSkewMs ?? 5_000);
  const latest = input.submittedAtMs + (input.outcomeWindowMs ?? 60_000);
  return withdrawals.find((withdrawal) => {
    const createdAtMs = Date.parse(withdrawal.createdAt);
    return Math.round(withdrawal.amount * 100) === input.amountSen
      && Number.isFinite(createdAtMs)
      && createdAtMs >= earliest
      && createdAtMs <= latest;
  }) ?? null;
}
```

Do not infer success from status or destination label.

- [ ] **Step 4: Add failing Wallet submission contracts**

```ts
expect(page).toContain('const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false)');
expect(page).toContain('const WITHDRAWAL_ACTION_TIMEOUT_MS = 15_000');
expect(page).toContain('findSubmittedWithdrawal');
expect(page).toContain('tCustomer("ui.wallet.confirmingWithdrawal")');
expect(page).toContain('tCustomer("ui.wallet.withdrawalOutcomeUnknown")');
expect(page).toContain('withdrawing || confirmingWithdrawal');
expect(handleWithdraw.indexOf('setWithdrawalSubmitted(true)'))
  .toBeLessThan(handleWithdraw.indexOf('void refreshWalletState(selectedDestinationId)'));
```

- [ ] **Step 5: Run the contract and verify RED**

```bash
npx vitest run app/customer/wallet/__tests__/stripe-jit.test.ts
```

Expected: current success waits for refresh and every exception is treated as definite failure.

- [ ] **Step 6: Implement immediate success and bounded reconciliation**

Add alongside the Wallet read timeout:

```ts
const WITHDRAWAL_ACTION_TIMEOUT_MS = 15_000;
```

Capture:

```ts
const amountSen = Math.round(amount * 100);
const submittedAtMs = Date.now();
```

Wrap submission with a 15-second controller. On `201` immediately call:

```ts
setWithdrawalSubmitted(true);
setShowWithdraw(false);
setWithdrawAmount("");
void refreshWalletState(selectedDestinationId);
```

On `AbortError`, show `confirmingWithdrawal`, keep submit disabled, and perform at most three `getMyWithdrawals` reads after delays `0`, `1_500`, and `3_000` milliseconds. Give every read its own eight-second controller. If the helper finds a match, use the normal success state. Otherwise show `withdrawalOutcomeUnknown` and re-enable submission. Keep the database `active_withdrawal_exists` guard unchanged.

- [ ] **Step 7: Run focused tests and verify GREEN**

```bash
npx vitest run lib/wallet/__tests__/withdrawal-reconciliation.test.ts app/customer/wallet/__tests__/stripe-jit.test.ts app/api/wallet/withdrawals/__tests__/route.test.ts
```

Expected: known success is immediate and ambiguous timeouts cannot immediately trigger a duplicate attempt.

- [ ] **Step 8: Commit**

```bash
git add lib/wallet/withdrawal-reconciliation.ts lib/wallet/__tests__/withdrawal-reconciliation.test.ts app/customer/wallet/page.tsx app/customer/wallet/__tests__/stripe-jit.test.ts
git commit -m "fix: reconcile timed out withdrawal submissions"
```

### Task 5: Add short-lived Wallet moderation credentials

**Files:**
- Create: `lib/wallet/moderation-credential.ts`
- Create: `lib/wallet/__tests__/moderation-credential.test.ts`
- Modify: `lib/moderation.ts`
- Modify: `lib/moderation.test.ts`
- Modify: `lib/wallet/moderation-guard.ts`
- Modify: `lib/wallet/__tests__/moderation-guard.test.ts`
- Create: `app/api/admin/withdrawals/[id]/review-reason/route.ts`
- Create: `app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts`
- Modify: `app/api/admin/withdrawals/[id]/reject/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts`
- Modify: `README.md`

**Interfaces:**

```ts
export type WalletModerationResult =
  | { flagged: boolean; relevant: boolean; professional: boolean; categories: string[]; advisoryMessage: string | null }
  | { error: 'api_unavailable' };

export type WalletModerationAdvisory = {
  reasons: Array<'relevance' | 'tone'>;
  message: string;
};

export type WalletModerationCredentialClaims = {
  version: 1;
  actorId: string;
  withdrawalId: string;
  action: 'reject';
  reasonCategory: string;
  reasonSha256: string;
  verdict: 'clear' | 'advisory';
  issuedAt: number;
  expiresAt: number;
};

export type WalletModerationCredentialInput = {
  actorId: string;
  withdrawalId: string;
  action: 'reject';
  reasonCategory: string;
  reason: string;
  verdict: 'clear' | 'advisory';
};

export type WalletModerationCredentialExpected = Omit<WalletModerationCredentialInput, 'verdict'>;
export type WalletModerationCredentialVerification =
  | { valid: true; claims: WalletModerationCredentialClaims }
  | { valid: false; reason: 'malformed' | 'signature' | 'claims' | 'expired' | 'mismatch' };
```

Preview response:

```ts
{
  verdict: 'clear' | 'advisory';
  advisory: WalletModerationAdvisory | null;
  moderationCredential: string;
}
```

- [ ] **Step 1: Write failing Gemini output tests**

Require the prompt to request this schema:

```json
{"flagged":false,"relevant":true,"professional":true,"categories":[],"advisoryMessage":null}
```

Test:

```ts
mockGemini({
  flagged: false,
  relevant: false,
  professional: false,
  categories: ['category_mismatch', 'tone'],
  advisoryMessage: 'State the payout mismatch factually and use neutral language.',
});
await expect(moderateWalletReason(reason, 'reject', 'bank_details_mismatch')).resolves.toEqual({
  flagged: false,
  relevant: false,
  professional: false,
  categories: ['category_mismatch', 'tone'],
  advisoryMessage: 'State the payout mismatch factually and use neutral language.',
});
```

Malformed booleans, advisory text over 300 characters, invalid JSON, timeout, and non-2xx must return `{ error: 'api_unavailable' }`.

- [ ] **Step 2: Run moderation tests and verify RED**

```bash
npx vitest run lib/moderation.test.ts lib/wallet/__tests__/moderation-guard.test.ts
```

Expected: professional tone and advisory text are absent.

- [ ] **Step 3: Extend moderation and keep hard blocks**

Add these prompt rules:

```ts
'Set professional=true only when the explanation is polite, neutral, and suitable for a customer-visible financial decision.',
'When relevant=false or professional=false, provide one concise advisoryMessage of at most 300 characters. Otherwise use null.',
'Respond with valid JSON only, no markdown: {"flagged": boolean, "relevant": boolean, "professional": boolean, "categories": string[], "advisoryMessage": string|null}.',
```

Validate every field. In the guard derive:

```ts
const reasons = [
  ...(!result.relevant ? ['relevance' as const] : []),
  ...(!result.professional ? ['tone' as const] : []),
];
const advisory = reasons.length > 0
  ? { reasons, message: result.advisoryMessage ?? 'Review the reason for relevance and professional tone.' }
  : null;
```

Return `{ ok: true, categories, advisory }`. Record `irrelevant` when relevance is false; record `accepted` for a tone-only advisory and retain a `tone` model category. Preserve flagged/unavailable/rate-limit behavior.

- [ ] **Step 4: Write failing credential tests**

```ts
const token = signWalletModerationCredential({
  actorId, withdrawalId, action: 'reject', reasonCategory,
  reason: 'The verified payout details do not match.', verdict: 'advisory',
}, secret, nowSeconds);
expect(verifyWalletModerationCredential(token, {
  actorId, withdrawalId, action: 'reject', reasonCategory,
  reason: 'The verified payout details do not match.',
}, secret, nowSeconds + 60)).toMatchObject({ valid: true, claims: { verdict: 'advisory' } });
```

Also test changed reason/category, wrong actor/withdrawal, altered signature, expiry, malformed token, and missing secret. Assert the token does not contain the raw reason.

- [ ] **Step 5: Run credential test and verify RED**

```bash
npx vitest run lib/wallet/__tests__/moderation-credential.test.ts
```

Expected: module missing.

- [ ] **Step 6: Implement a dedicated fail-closed credential**

Use `v1.<base64url-json>.<base64url-hmac-sha256>`, five-minute expiry, `timingSafeEqual`, and strict claim validation:

```ts
export function walletReasonSha256(reason: string) {
  return createHash('sha256').update(reason.trim(), 'utf8').digest('hex');
}

export function walletModerationSecret() {
  const secret = process.env.WALLET_MODERATION_REVIEW_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('wallet_moderation_secret_invalid');
  return secret;
}
```

Expose exact signing and verification signatures with defaulted production inputs so tests can inject time and key material deterministically:

```ts
export function signWalletModerationCredential(
  input: WalletModerationCredentialInput,
  secret: string = walletModerationSecret(),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string;

export function verifyWalletModerationCredential(
  token: string,
  expected: WalletModerationCredentialExpected,
  secret: string = walletModerationSecret(),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): WalletModerationCredentialVerification;
```

Bind actor, withdrawal, action, category, reason hash, verdict, issue time, and expiry. Never include the raw reason or use a fallback or sub-32-byte secret.

- [ ] **Step 7: Add failing preview/rejection route tests**

For `review-reason`, prove authorization precedes moderation, invalid categories fail before Gemini, hard-block status mappings remain, and advisory returns:

```ts
expect(body.data).toEqual({
  verdict: 'advisory',
  advisory: { reasons: ['relevance', 'tone'], message: 'State the mismatch factually and use neutral language.' },
  moderationCredential: 'signed-review-token',
});
```

For rejection, remove the Gemini mock and require credential verification with actor, withdrawal, action, category, and reason. Missing/invalid/expired credentials return `422 MODERATION_REVIEW_REQUIRED`; an advisory credential without `advisoryAccepted: true` returns `422 ADVISORY_ACKNOWLEDGEMENT_REQUIRED`. Every failure skips `reject_wallet_withdrawal`.

Also prove a missing `WALLET_MODERATION_REVIEW_SECRET` returns `503 MODERATION_REVIEW_UNAVAILABLE` from both routes without issuing a credential or calling `reject_wallet_withdrawal`.

- [ ] **Step 8: Run route tests and verify RED**

```bash
npx vitest run 'app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts' 'app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts'
```

Expected: preview route and credential verification are absent.

- [ ] **Step 9: Implement preview issuance and final verification**

Preview route:

```ts
const { user, response } = await requireStaffPermission('admin.withdrawal.approve');
if (response) return response;
const moderation = await moderateWalletAction({
  actorId: user.id, withdrawalId: id, action: 'reject',
  reasonCategory: validated.data.reasonCategory, reason: validated.data.reason,
});
if (!moderation.ok) return apiFail(moderation.code, moderation.message,
  moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);
const verdict = moderation.advisory ? 'advisory' : 'clear';
const moderationCredential = signWalletModerationCredential({
  actorId: user.id, withdrawalId: id, action: 'reject',
  reasonCategory: validated.data.reasonCategory, reason: validated.data.reason, verdict,
});
return apiOk({ verdict, advisory: moderation.advisory, moderationCredential });
```

Catch only `wallet_moderation_secret_invalid` around signing and verification and map it to `503 MODERATION_REVIEW_UNAVAILABLE`. Treat malformed, altered, mismatched, or expired client credentials as `422 MODERATION_REVIEW_REQUIRED`; do not collapse server misconfiguration into a client validation error.

Final schema:

```ts
const rejectSchema = z.object({
  reasonCategory: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(500),
  moderationCredential: z.string().min(1).max(4096),
  advisoryAccepted: z.boolean().default(false),
}).strict();
```

Verify after permission and reason validation but before the RPC. Require acknowledgement only when claims say `advisory`. Keep server IP, email, response shape, and rejection RPC unchanged.

- [ ] **Step 10: Document the required secret**

Add to `README.md` without touching `.env.local`:

```markdown
- `WALLET_MODERATION_REVIEW_SECRET` is a server-only high-entropy secret of at least 32 bytes used to sign five-minute withdrawal-reason review credentials. Configure it anywhere administrators review or reject withdrawals. Missing or weak configuration fails closed; never expose it through `NEXT_PUBLIC_*`, logs, or client payloads.
```

- [ ] **Step 11: Run focused server tests and verify GREEN**

```bash
npx vitest run lib/moderation.test.ts lib/wallet/__tests__/moderation-guard.test.ts lib/wallet/__tests__/moderation-credential.test.ts 'app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts' 'app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts'
```

Expected: one preview creates one audit attempt; final rejection makes no second Gemini call.

- [ ] **Step 12: Commit**

```bash
git add lib/moderation.ts lib/moderation.test.ts lib/wallet/moderation-guard.ts lib/wallet/__tests__/moderation-guard.test.ts lib/wallet/moderation-credential.ts lib/wallet/__tests__/moderation-credential.test.ts 'app/api/admin/withdrawals/[id]/review-reason/route.ts' 'app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts' 'app/api/admin/withdrawals/[id]/reject/route.ts' 'app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts' README.md
git commit -m "feat: govern withdrawal reason assistant"
```

### Task 6: Present Assistant advice in the existing Admin UI

**Files:**
- Modify: `components/admin/withdrawal-review-detail.tsx`
- Modify: `app/admin/withdrawals/[id]/__tests__/page.contract.test.ts`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`
- Modify: `tests/e2e/wallet-governance.spec.ts`

**Interfaces:**
- Consumes: Task 5 preview response and `moderationCredential`.
- Produces: rejection-only states for reviewing, blocking error, advisory, and final confirmation.

- [ ] **Step 1: Add failing detail contracts**

```ts
expect(componentSource).toContain('type AssistantReview');
expect(componentSource).toContain('const [reviewingReason, setReviewingReason] = useState(false)');
expect(componentSource).toContain('/review-reason');
expect(componentSource).toContain('moderationCredential');
expect(componentSource).toContain('advisoryAccepted');
expect(componentSource).toContain('setAssistantReview(null)');
expect(componentSource).toContain('withdrawals.assistant.continueAnyway');
expect(componentSource).toContain('withdrawals.assistant.returnToEdit');
```

Require non-reject decisions to retain direct confirmation.

- [ ] **Step 2: Add a failing advisory browser journey**

Intercept `/review-reason` before the generic action route and return:

```ts
{
  data: {
    verdict: 'advisory',
    advisory: { reasons: ['tone'], message: 'Use neutral language and state the payout mismatch factually.' },
    moderationCredential: 'signed-review-token',
  },
  error: null,
}
```

Drive Reject → category → note → Continue. Assert advice is visible and reject has not executed. Click Continue anyway, confirm, and require:

```ts
{
  reasonCategory: 'bank_details_mismatch',
  reason: 'The payout details do not match this customer.',
  moderationCredential: 'signed-review-token',
  advisoryAccepted: true,
}
```

Edit the note after preview and assert the credential/advisory is cleared.

- [ ] **Step 3: Run UI tests and verify RED**

```bash
npx vitest run 'app/admin/withdrawals/[id]/__tests__/page.contract.test.ts'
npx playwright test tests/e2e/wallet-governance.spec.ts --grep "withdrawal rejection assistant"
```

Expected: preview state is absent.

- [ ] **Step 4: Implement the rejection-only state machine**

```ts
type AssistantReview = {
  verdict: 'clear' | 'advisory';
  advisory: null | { reasons: Array<'relevance' | 'tone'>; message: string };
  moderationCredential: string;
};
```

Extend `PendingConfirmation` with optional `moderationCredential` and `advisoryAccepted`. Reject's Continue calls `/review-reason`; clear opens confirmation; advisory renders:

```tsx
<div role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
  <p className="font-semibold">{t("withdrawals.assistant.title")}</p>
  <p className="mt-1">{assistantReview.advisory?.message}</p>
  <div className="mt-3 flex flex-wrap gap-2">
    <Button type="button" variant="outline" onClick={() => setAssistantReview(null)}>
      {t("withdrawals.assistant.returnToEdit")}
    </Button>
    <Button type="button" onClick={continueAfterAdvisory}>
      {t("withdrawals.assistant.continueAnyway")}
    </Button>
  </div>
</div>
```

Category/note edits clear Assistant review, pending confirmation, and error. Final Reject sends credential and acknowledgement. Approve, Hold, Resume, and Fraud Override retain current bodies and moderation.

- [ ] **Step 5: Add exact Admin copy**

Add under `withdrawals.assistant`:

```jsonc
// en
{"title":"Gemini Assistant suggestion","reviewing":"Reviewing the reason…","clear":"The reason is ready for confirmation.","returnToEdit":"Return to edit","continueAnyway":"Continue anyway","advisoryNotice":"This is an advisory suggestion. An authorized administrator may continue after reviewing it."}
// ms
{"title":"Cadangan Pembantu Gemini","reviewing":"Menyemak sebab…","clear":"Sebab sedia untuk pengesahan.","returnToEdit":"Kembali untuk sunting","continueAnyway":"Teruskan juga","advisoryNotice":"Ini ialah cadangan sahaja. Pentadbir yang diberi kuasa boleh meneruskan selepas menyemaknya."}
// zh-CN
{"title":"Gemini Assistant 建议","reviewing":"正在审核理由…","clear":"该理由可以进入确认步骤。","returnToEdit":"返回修改","continueAnyway":"仍然继续","advisoryNotice":"此内容仅为辅助建议；授权管理员审阅后仍可继续。"}
```

- [ ] **Step 6: Run UI tests and verify GREEN**

Run Step 3 again. Expected: advice appears before action and final confirmation remains required.

- [ ] **Step 7: Commit**

```bash
git add components/admin/withdrawal-review-detail.tsx 'app/admin/withdrawals/[id]/__tests__/page.contract.test.ts' app/i18n/locales/en/admin.json app/i18n/locales/ms/admin.json app/i18n/locales/zh-CN/admin.json tests/e2e/wallet-governance.spec.ts
git commit -m "feat: show withdrawal rejection guidance"
```

### Task 7: Final verification and bounded security review

**Files:**
- Verify only; no planned production edits.
- Review every file changed in Tasks 1–6.

**Interfaces:**
- Consumes: all completed changes.
- Produces: test evidence and one must-fix/follow-up classified review.

- [ ] **Step 1: Run the focused regression set**

```bash
npx vitest run \
  lib/wallet/__tests__/transaction-display.test.ts \
  components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts \
  components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx \
  backend/domains/__tests__/customer-wallet-history.test.ts \
  lib/payouts/__tests__/tng-identity.test.ts \
  app/api/wallet/destinations/__tests__/route.test.ts \
  app/api/wallet/withdrawals/__tests__/route.test.ts \
  app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts \
  app/customer/wallet/__tests__/payout-destinations.test.ts \
  app/customer/wallet/__tests__/transaction-history.contract.test.ts \
  app/customer/wallet/__tests__/stripe-jit.test.ts \
  lib/wallet/__tests__/withdrawal-reconciliation.test.ts \
  lib/moderation.test.ts \
  lib/wallet/__tests__/moderation-guard.test.ts \
  lib/wallet/__tests__/moderation-credential.test.ts \
  'app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts' \
  'app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts' \
  'app/admin/withdrawals/[id]/__tests__/page.contract.test.ts'
```

Expected: all focused tests pass.

- [ ] **Step 2: Run static verification once**

```bash
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: all exit successfully. Report existing unrelated warnings without broad cleanup.

- [ ] **Step 3: Run affected browser journeys once**

```bash
npx playwright test tests/e2e/wallet-governance.spec.ts --grep "TNG verified phone|withdrawal rejection assistant"
```

Expected: customer sees only the masked verified phone, submits RM50 without editable identity, and sees signed ledger amounts; Admin can consciously override advice and submit a credential-bound rejection.

- [ ] **Step 4: Delegate one bounded `luna_worker` review**

Use this exact read-only brief:

```text
Review the final withdrawal trust changes. Verify that arbitrary TNG phone/DuitNow/provider references cannot cross the browser-to-server boundary; old mismatched destinations cannot be used; full phones, provider references, raw Gemini reasons, and secrets are not exposed; credentials bind actor, withdrawal, action, category, reason hash, and expiry; and ambiguous timeouts cannot create duplicate withdrawals. Classify only confirmed authorization, privacy, money-loss, or requirement violations as must-fix. Classify all other observations as follow-up. Do not edit files.
```

Expected: one focused report. Allow at most one repair/re-review cycle and only for a confirmed must-fix issue.

- [ ] **Step 5: Preserve unrelated work and inspect the final diff**

```bash
git status --short
git diff --stat 43cb0e4..HEAD
git diff --check 43cb0e4..HEAD
```

Confirm these unrelated files never enter implementation commits:

```text
app/api/checkout/__tests__/simulator-prepare.test.ts
app/api/checkout/prepare/route.ts
supabase/migrations/20260910114500_fix_multi_outlet_checkout.sql
supabase/migrations/__tests__/20260910114500_fix_multi_outlet_checkout.test.ts
```

- [ ] **Step 6: Report evidence and stop after the bounded review**

Report focused tests, TypeScript, lint, Playwright, diff check, and review classification. Treat campus-network quality, production TNG, broad Wallet refactors, and non-blocking polish as follow-up.

## Scope Boundaries

### Files intentionally modified or created

- `lib/wallet/transaction-display.ts`
- `lib/wallet/__tests__/transaction-display.test.ts`
- `components/customer/wallet/customer-transaction-history.tsx`
- `components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`
- `components/customer/wallet/__tests__/customer-transaction-history.render.test.tsx`
- `lib/payouts/tng-identity.ts`
- `lib/payouts/__tests__/tng-identity.test.ts`
- `app/api/wallet/destinations/route.ts`
- `app/api/wallet/destinations/__tests__/route.test.ts`
- `app/api/wallet/withdrawals/route.ts`
- `app/api/wallet/withdrawals/__tests__/route.test.ts`
- `app/customer/wallet/page.tsx`
- `app/customer/wallet/__tests__/payout-destinations.test.ts`
- `app/customer/wallet/__tests__/transaction-history.contract.test.ts`
- `app/customer/wallet/__tests__/stripe-jit.test.ts`
- `backend/domains/commerce.ts`
- `backend/domains/__tests__/customer-wallet-history.test.ts`
- `lib/wallet/withdrawal-reconciliation.ts`
- `lib/wallet/__tests__/withdrawal-reconciliation.test.ts`
- `lib/moderation.ts`
- `lib/moderation.test.ts`
- `lib/wallet/moderation-guard.ts`
- `lib/wallet/__tests__/moderation-guard.test.ts`
- `lib/wallet/moderation-credential.ts`
- `lib/wallet/__tests__/moderation-credential.test.ts`
- `app/api/admin/withdrawals/[id]/review-reason/route.ts`
- `app/api/admin/withdrawals/[id]/review-reason/__tests__/route.test.ts`
- `app/api/admin/withdrawals/[id]/reject/route.ts`
- `app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts`
- `components/admin/withdrawal-review-detail.tsx`
- `app/admin/withdrawals/[id]/__tests__/page.contract.test.ts`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/ms/admin.json`
- `app/i18n/locales/zh-CN/admin.json`
- `tests/e2e/wallet-governance.spec.ts`
- `README.md`

### Files explicitly not touched

- `package.json`
- `next.config.ts`
- `.env.local`
- `app/api/checkout/**`
- `app/api/stripe/**`
- `app/api/tng/payout/webhook/**`
- `lib/payouts/tng-webhook.ts`
- `lib/payouts/execute-approved-withdrawal.ts`
- `supabase/migrations/**`
- `supabase/legacy-migrations/**`
- `supabase/seed.sql`
- Vendor Wallet, recommendation moderation, KYC review, checkout, orders, refunds, and unrelated Admin pages.

## New Dependencies

None. HMAC, SHA-256, and constant-time comparison use Node's existing `crypto` module.

## Database Changes

None. Reuse existing `users`, `payout_destinations`, `withdrawal_requests`, `wallet_transactions`, `wallet_moderation_attempts`, and RPC contracts.

## Risks

- TNG remains mock-only. Binding proves MyWisata used the verified platform phone, not a production TNG ownership contract.
- Changing the verified account phone disables the previous TNG destination until the customer recreates it for the new verified number.
- Rotating `TNG_MOCK_WEBHOOK_SECRET` changes deterministic mock references and disables older TNG destinations; customers must recreate them.
- A browser timeout cannot cancel accepted server work; bounded reconciliation and the database active-withdrawal guard are mandatory.
- `WALLET_MODERATION_REVIEW_SECRET` becomes required for rejection review; missing configuration deliberately blocks review and rejection.
- Authorized administrators can override relevance/tone advice by design; prohibited content remains non-bypassable.
- Extending the shared moderation result affects other Wallet actions at the type level; focused tests must prove their blocking behavior stays unchanged.
- `app/customer/wallet/page.tsx` remains large. Splitting it is outside scope to avoid unrelated refactor risk.
