import "server-only";
import { createPickupCode, formatPickupCode, normalizePickupCode } from "@/lib/pickup-code";

export function createRetailPickupCode() {
  return createPickupCode("retail");
}

export function normalizeRetailPickupCode(value: string) {
  return normalizePickupCode(value, "retail");
}

export function formatRetailPickupCode(value: string) {
  return formatPickupCode(value, "retail");
}
