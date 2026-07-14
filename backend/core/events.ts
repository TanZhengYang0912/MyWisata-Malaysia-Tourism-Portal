// Contract #5: single dispatch point for cross-domain effects.
// Mock impl: synchronous in-memory listeners + console log. Swap for a real
// bus later without touching callers.
import type { DomainEvent, DomainEventName } from "./types";

type Listener = (event: DomainEvent) => void;

const listeners = new Map<DomainEventName, Listener[]>();

export function on(name: DomainEventName, fn: Listener) {
  const list = listeners.get(name) ?? [];
  list.push(fn);
  listeners.set(name, list);
}

export function emit<T>(name: DomainEventName, payload: T) {
  const event: DomainEvent<T> = { name, payload, at: new Date().toISOString() };
  if (process.env.NODE_ENV !== "production") {
    console.log("[event]", name, payload);
  }
  for (const fn of listeners.get(name) ?? []) fn(event);
}
