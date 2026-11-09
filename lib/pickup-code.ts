import "server-only";
import { randomInt } from "node:crypto";

export type PickupCodeKind = "retail" | "event" | "ticket" | "food";

const PICKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PICKUP_CODE_PREFIXES: Record<PickupCodeKind, string> = { retail: "P", event: "E", ticket: "T", food: "F" };
const PICKUP_CODE_PATTERNS: Record<PickupCodeKind, RegExp> = {
  retail: /^P[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/,
  event: /^E[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/,
  ticket: /^T[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/,
  food: /^F[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/,
};

export function createPickupCode(kind: PickupCodeKind) {
  let code = PICKUP_CODE_PREFIXES[kind];
  for (let index = 0; index < 10; index += 1) {
    code += PICKUP_CODE_ALPHABET[randomInt(PICKUP_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizePickupCode(value: string, kind: PickupCodeKind) {
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return PICKUP_CODE_PATTERNS[kind].test(code) ? code : null;
}

export function formatPickupCode(value: string, kind: PickupCodeKind) {
  const code = normalizePickupCode(value, kind);
  if (!code) throw new Error("pickup_code_invalid");
  return `${code.slice(0, 1)}-${code.slice(1, 6)}-${code.slice(6)}`;
}
