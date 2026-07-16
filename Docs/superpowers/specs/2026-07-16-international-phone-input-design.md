# International Phone Input Design

## Goal

Replace the current free-text, Malaysia-oriented phone fields with a reusable international phone input. A customer can search and select any country or territory, enter a national number, and complete the existing Twilio OTP flow.

## Decisions

- Default the selected country to Malaysia (`MY`, `+60`).
- Allow search and selection across all countries and territories provided by the phone-input library.
- Keep phone country independent from the Profile `country` field; selecting a dial code never changes a user's residence country.
- Store and transmit only an E.164 number, such as `+60177143951`.
- Do not add a database migration. The existing `users.phone` and OTP tables already hold E.164-compatible strings.

## Approach

Use `react-international-phone` for the accessible country selector, flags, dial-code display, search, and as-you-type formatting. Use `libphonenumber-js` on the server for authoritative parsing and validation.

The approach avoids maintaining a duplicated country-code catalogue while ensuring the API does not trust a client-side formatted value.

## Components

Create one `InternationalPhoneInput` client component with a small, explicit interface:

- `value`: E.164 or editable phone value.
- `onChange`: receives the canonical E.164 value when one can be formed.
- `disabled`, `error`, and optional label support.
- Defaults to `MY`, without overwriting a supplied E.164 value.

Use this component in both existing phone flows:

1. The Phone step in Profile completion.
2. The Change phone editor in Profile settings.

Both flows continue to submit `{ phone: e164 }` to the existing OTP endpoints.

## Server Validation and OTP Flow

Replace the current syntax-only E.164 check with parsing and valid-number checks from `libphonenumber-js`. The API must reject malformed, impossible, or invalid country-number combinations before it performs collision checks, writes OTP attempts, or calls Twilio.

The following remain unchanged:

- Twilio Verify sends and verifies the OTP.
- A verified phone number remains unique across users.
- OTP attempts remain rate-limited per E.164 number.
- The database continues to store the canonical E.164 value.

If Twilio cannot send to the selected destination because the destination is unsupported, blocked by account geo permissions, or otherwise unreachable, the existing route returns a failed response and the UI displays that response. It must not advance to the OTP-entry state or report that a code was sent.

## Error Handling

- Client: show a local validation error when no usable E.164 value exists.
- API: return a clear validation error for an invalid international number.
- Twilio: retain the provider error mapping, including invalid/unreachable numbers, rate limits, and service errors.
- A user may change the selected country after an error and retry; no Profile Country field changes as a side effect.

## Testing

- Component defaults to Malaysia.
- Selecting another country produces the expected E.164 value.
- Existing E.164 values load with the corresponding calling code.
- Invalid national numbers are rejected by the shared client helper and by the API schema.
- Valid international E.164 numbers reach the existing OTP collision/rate-limit path.
- Profile completion and Profile settings both render the shared input rather than separate phone-field implementations.

## Scope Boundaries

This work changes only phone entry, formatting, validation, and related tests. It does not change user residence country, database structure, KYC, account lifecycle, checkout requirements, Twilio credentials, or the OTP security model.
