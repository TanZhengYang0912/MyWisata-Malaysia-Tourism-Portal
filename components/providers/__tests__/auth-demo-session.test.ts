import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo account session handoff", () => {
  it("hydrates the browser Supabase session before loading the selected profile", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toContain("await supabase.auth.setSession");
    expect(source.indexOf("await supabase.auth.setSession")).toBeLessThan(source.indexOf("return await loadSupabaseUser(id, requestVersion)"));
  });

  it("handles a rejected background profile load from an auth-state event", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");
    const listenerStart = source.indexOf("supabase.auth.onAuthStateChange");
    const listenerEnd = source.indexOf("return () =>", listenerStart);
    const listenerSource = source.slice(listenerStart, listenerEnd);

    expect(listenerSource).toContain(".catch(() =>");
    expect(listenerSource.indexOf(".catch(() =>")).toBeLessThan(listenerSource.indexOf(".finally(() =>"));
  });

  it("defers profile queries until the Supabase auth callback releases its lock", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");
    const listenerStart = source.indexOf("supabase.auth.onAuthStateChange");
    const listenerEnd = source.indexOf("return () =>", listenerStart);
    const listenerSource = source.slice(listenerStart, listenerEnd);

    expect(listenerSource).toContain("window.setTimeout(() => {");
    expect(listenerSource.indexOf("window.setTimeout(() => {")).toBeLessThan(listenerSource.indexOf("loadSupabaseUser(session.user.id"));
  });

  it("invalidates older profile loads when the authenticated account changes", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toContain("useRef(0)");
    expect(source).toContain("requestVersion !== profileLoadVersion.current");
    expect(source).toContain("const requestVersion = ++profileLoadVersion.current");
    expect(source).toContain("loadSupabaseUser(user.id, initialRequestVersion)");
    expect(source).toContain("loadSupabaseUser(id, requestVersion)");
    expect(source).toContain("loadSupabaseUser(user.id, requestVersion)");
    expect(source).not.toContain("expectedVersion ?? ++profileLoadVersion.current");
  });
});
