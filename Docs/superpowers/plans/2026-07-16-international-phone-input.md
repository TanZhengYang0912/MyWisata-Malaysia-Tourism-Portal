# International Phone Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Replace raw phone entry with an all-country searchable input while preserving OTP security.

**Architecture:** Use react-international-phone for a shared country search field. Use libphonenumber-js as one pure E.164 parser used by browser code and Zod schemas.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Zod 4, react-international-phone@4.8.0, libphonenumber-js@1.13.8, Supabase, Twilio Verify.

## Global Constraints

- Default Malaysia (MY, +60); expose every library-supported country or territory.
- Phone country never mutates the Profile Country field.
- Only canonical valid E.164 values reach API, Twilio, and Supabase.
- No migration or changes to checkout, KYC, lifecycle, or credentials.
- Preserve unrelated dirty files.

## File Structure

- Create lib/phone/international.ts and lib/phone/__tests__/international.test.ts.
- Modify lib/validation/phone-schemas.ts; create lib/validation/__tests__/phone-schemas.test.ts.
- Create components/profile/international-phone-input.tsx and its contract test.
- Modify app/customer/profile/page.tsx and components/profile/profile-sections.tsx.
- Create app/customer/profile/__tests__/international-phone-input-usage.test.ts.
- Modify package.json and package-lock.json.


---

### Task 1: Add dependencies and a canonical E.164 parser

**Files:**
- Create: lib/phone/international.ts
- Create: lib/phone/__tests__/international.test.ts
- Modify: package.json
- Modify: package-lock.json

**Interfaces:**
- Produces parseInternationalPhone(value: string): InternationalPhoneParseResult.
- Result is either { ok: true; e164: string } or { ok: false; message: "Enter a valid international phone number" }.

- [ ] **Step 1: Write the failing parser test**

~~~ts
import { describe, expect, it } from "vitest";
import { parseInternationalPhone } from "@/lib/phone/international";

describe("parseInternationalPhone", () => {
  it("canonicalizes valid Malaysian and US numbers", () => {
    expect(parseInternationalPhone("+60 17-714 3951")).toEqual({ ok: true, e164: "+60177143951" });
    expect(parseInternationalPhone("+1 202 555 0142")).toEqual({ ok: true, e164: "+12025550142" });
  });

  it("rejects local-only and impossible numbers", () => {
    expect(parseInternationalPhone("0177143951")).toEqual({ ok: false, message: "Enter a valid international phone number" });
    expect(parseInternationalPhone("+601")).toEqual({ ok: false, message: "Enter a valid international phone number" });
  });
});
~~~

- [ ] **Step 2: Verify red**

Run: npx vitest run lib/phone/__tests__/international.test.ts

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Install exact dependencies**

Run: npm install react-international-phone@4.8.0 libphonenumber-js@1.13.8

Expected: package.json lists both dependencies and package-lock.json updates.

- [ ] **Step 4: Implement the parser**

~~~ts
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type InternationalPhoneParseResult =
  | { ok: true; e164: string }
  | { ok: false; message: "Enter a valid international phone number" };

const invalid = (): InternationalPhoneParseResult => ({
  ok: false,
  message: "Enter a valid international phone number",
});

export function parseInternationalPhone(value: string): InternationalPhoneParseResult {
  const input = value.trim();
  if (!input.startsWith("+")) return invalid();

  const parsed = parsePhoneNumberFromString(input, { extract: false });
  if (!parsed || !parsed.isValid()) return invalid();

  return { ok: true, e164: parsed.number };
}
~~~

- [ ] **Step 5: Verify green and commit**

Run: npx vitest run lib/phone/__tests__/international.test.ts

Expected: PASS, 2 tests.

~~~bash
git add package.json package-lock.json lib/phone/international.ts lib/phone/__tests__/international.test.ts
git commit -m "feat: validate international phone numbers"
~~~

### Task 2: Enforce the parser at the OTP API boundary

**Files:**
- Modify: lib/validation/phone-schemas.ts
- Create: lib/validation/__tests__/phone-schemas.test.ts

**Interfaces:**
- Consumes parseInternationalPhone from Task 1.
- sendOtpSchema and verifyOtpSchema output canonical phone strings, so the existing routes keep using parsed.data.phone.

- [ ] **Step 1: Write the failing schema test**

~~~ts
import { describe, expect, it } from "vitest";
import { sendOtpSchema, verifyOtpSchema } from "@/lib/validation/phone-schemas";

describe("phone API schemas", () => {
  it("normalizes a formatted valid number", () => {
    expect(sendOtpSchema.parse({ phone: "+60 17-714 3951" })).toEqual({ phone: "+60177143951" });
  });

  it("rejects impossible phones and non-digit OTP values", () => {
    expect(() => verifyOtpSchema.parse({ phone: "+601", code: "123456" })).toThrow("Enter a valid international phone number");
    expect(() => verifyOtpSchema.parse({ phone: "+12025550142", code: "12ab56" })).toThrow();
  });
});
~~~

- [ ] **Step 2: Verify red**

Run: npx vitest run lib/validation/__tests__/phone-schemas.test.ts

Expected: FAIL because the current regex does not normalize formatted input or validate a real numbering plan.

- [ ] **Step 3: Replace the syntax-only schema**

~~~ts
import { z } from "zod";
import { parseInternationalPhone } from "@/lib/phone/international";

const internationalPhoneSchema = z.string().trim().transform((value, context) => {
  const parsed = parseInternationalPhone(value);
  if (!parsed.ok) {
    context.addIssue({ code: "custom", message: parsed.message });
    return z.NEVER;
  }
  return parsed.e164;
});

export const sendOtpSchema = z.object({ phone: internationalPhoneSchema }).strict();
export const verifyOtpSchema = z.object({
  phone: internationalPhoneSchema,
  code: z.string().min(4).max(8).regex(/^\d+$/, "Code must be digits only"),
}).strict();

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
~~~

- [ ] **Step 4: Verify green and commit**

Run: npx vitest run lib/validation/__tests__/phone-schemas.test.ts lib/phone/__tests__/international.test.ts

Expected: PASS, 4 tests.

~~~bash
git add lib/validation/phone-schemas.ts lib/validation/__tests__/phone-schemas.test.ts
git commit -m "feat: validate OTP phones internationally"
~~~

### Task 3: Create shared field

**Files:**
- Create: components/profile/international-phone-input.tsx
- Create: components/profile/__tests__/international-phone-input-contract.test.ts

**Interfaces:**
- Produces InternationalPhoneInput with id, value, onChange, disabled, and error props.
- It handles display only. Callers own OTP actions, Profile Country, and E.164 validation.

- [ ] **Step 1: Write the failing component contract test**

~~~ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("InternationalPhoneInput", () => {
  it("uses international input and defaults to Malaysia", () => {
    const source = readFileSync(resolve(process.cwd(), "components/profile/international-phone-input.tsx"), "utf8");
    expect(source).toContain("react-international-phone");
    expect(source).toContain('defaultCountry="my"');
    expect(source).toContain('autoComplete: "tel"');
  });
});
~~~

- [ ] **Step 2: Verify red**

Run: npx vitest run components/profile/__tests__/international-phone-input-contract.test.ts

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the component**

~~~tsx
"use client";

import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

interface InternationalPhoneInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

export function InternationalPhoneInput(props: InternationalPhoneInputProps) {
  return (
    <PhoneInput
      defaultCountry="my"
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      inputProps={{ id: props.id, name: props.id, type: "tel", autoComplete: "tel", "aria-invalid": props.error }}
      inputClassName={props.error ? "!border-destructive" : undefined}
    />
  );
}
~~~

Inspect installed 4.8.0 declarations before adding optional props. Do not suppress type errors. The library country selector must remain searchable.

- [ ] **Step 4: Verify green and commit**

Run: npx vitest run components/profile/__tests__/international-phone-input-contract.test.ts && npx tsc --noEmit

Expected: contract PASS; TypeScript exit code 0.

~~~bash
git add components/profile/international-phone-input.tsx components/profile/__tests__/international-phone-input-contract.test.ts
git commit -m "feat: add international phone input"
~~~

### Task 4: Replace Phone entry in Profile completion

**Files:**
- Modify: app/customer/profile/page.tsx
- Create: app/customer/profile/__tests__/international-phone-input-usage.test.ts

**Interfaces:**
- Consumes InternationalPhoneInput and parseInternationalPhone.
- Existing sendOtp and verifyOtp endpoint paths remain unchanged. Requests send parsedPhone.e164.

- [ ] **Step 1: Write the failing completion-flow contract test**

~~~ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Profile completion phone step", () => {
  it("uses shared input and canonical OTP requests", () => {
    const source = readFileSync(resolve(process.cwd(), "app/customer/profile/page.tsx"), "utf8");
    expect(source).toContain("InternationalPhoneInput");
    expect(source).toContain("parseInternationalPhone(phone)");
    expect(source).not.toContain('placeholder="+60123456789"');
  });
});
~~~

- [ ] **Step 2: Verify red**

Run: npx vitest run app/customer/profile/__tests__/international-phone-input-usage.test.ts

Expected: FAIL because the wizard renders a raw telephone input.

- [ ] **Step 3: Integrate shared input and canonicalize requests**

Add these imports:

~~~ts
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { parseInternationalPhone } from "@/lib/phone/international";
~~~

At the start of both sendOtp() and verifyOtp():

~~~ts
const parsedPhone = parseInternationalPhone(phone);
if (!parsedPhone.ok) {
  setPhoneError(parsedPhone.message);
  return;
}
setPhone(parsedPhone.e164);
~~~

Use an object with phone: parsedPhone.e164 in the send request and an object with phone: parsedPhone.e164 plus code: otp.trim() in the verify request. Replace the raw phone field with:

~~~tsx
<InternationalPhoneInput
  id="profile-phone"
  value={phone}
  onChange={(value) => { setPhone(value); setPhoneError(null); }}
  disabled={phoneBusy}
  error={Boolean(phoneError)}
/>
~~~

Do not alter country state or the Identity step.

- [ ] **Step 4: Verify green and commit**

Run: npx vitest run app/customer/profile/__tests__/international-phone-input-usage.test.ts lib/phone/__tests__/international.test.ts lib/validation/__tests__/phone-schemas.test.ts

Expected: PASS.

~~~bash
git add app/customer/profile/page.tsx app/customer/profile/__tests__/international-phone-input-usage.test.ts
git commit -m "feat: use international phone input in profile setup"
~~~

### Task 5: Replace Change phone entry and verify the complete slice

**Files:**
- Modify: components/profile/profile-sections.tsx
- Modify: app/customer/profile/__tests__/international-phone-input-usage.test.ts

**Interfaces:**
- Uses the same shared input and parser as Task 4.
- Leaves the personal-details country state, savePersonal(), and identity API call unchanged.

- [ ] **Step 1: Extend the failing usage test**

Append:

~~~ts
const settings = readFileSync(resolve(process.cwd(), "components/profile/profile-sections.tsx"), "utf8");

it("uses the shared field in Change phone", () => {
  expect(settings).toContain("InternationalPhoneInput");
  expect(settings).toContain("parseInternationalPhone(phone)");
  expect(settings).not.toContain('placeholder="+60123456789"');
});
~~~

- [ ] **Step 2: Verify red**

Run: npx vitest run app/customer/profile/__tests__/international-phone-input-usage.test.ts

Expected: FAIL because Profile settings has a separate raw phone input.

- [ ] **Step 3: Integrate Change phone**

Add the Task 4 imports. At the beginning of sendPhoneOtp() and verifyPhone(), call parseInternationalPhone(phone), return the parser message through existing error state when invalid, and submit parsedPhone.e164 when valid. Replace the raw input with:

~~~tsx
<InternationalPhoneInput
  id="settings-phone"
  value={phone}
  onChange={setPhone}
  disabled={busy}
  error={Boolean(error)}
/>
~~~

No code may update Profile Country while phone country changes.

- [ ] **Step 4: Run complete automated verification**

~~~bash
npx vitest run lib/phone/__tests__/international.test.ts lib/validation/__tests__/phone-schemas.test.ts components/profile/__tests__/international-phone-input-contract.test.ts app/customer/profile/__tests__/international-phone-input-usage.test.ts
npx eslint components/profile/international-phone-input.tsx app/customer/profile/page.tsx components/profile/profile-sections.tsx lib/phone/international.ts lib/validation/phone-schemas.ts
npx tsc --noEmit
git diff --check
~~~

Expected: targeted tests pass, ESLint has no new errors, TypeScript exits 0, and no whitespace errors occur. Stop npm run dev before npm run build because both use .next.

- [ ] **Step 5: Manual verification**

1. Open Profile completion as an email-verified user; Malaysia and +60 are preselected.
2. Search United States, enter a valid test number, and confirm request body is canonical +1 E.164.
3. Enter +601; confirm a local error appears and no OTP request is made.
4. Open My Profile > Change phone; confirm the same searchable field appears.
5. Select a destination blocked by the Twilio test account; confirm phone entry stays open and returned Twilio error is visible.
6. Confirm Profile Country did not change after changing the phone country.

- [ ] **Step 6: Commit**

~~~bash
git add components/profile/profile-sections.tsx app/customer/profile/__tests__/international-phone-input-usage.test.ts
git commit -m "feat: use international phone input in profile settings"
~~~
