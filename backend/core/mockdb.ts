// Minimal localStorage engine for the cart only. Everything else lives in
// Supabase now — cart stays local since it's ephemeral session state with
// no signed-in session to key a server-side cart on.
export const KEYS = { cart: "tp_cart" } as const;

function isBrowser() {
  return typeof window !== "undefined";
}

export function getCollection<T>(key: string): T[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function setCollection<T>(key: string, value: T[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Clears the local cart. */
export function resetDemo(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEYS.cart);
  window.location.href = "/login";
}
