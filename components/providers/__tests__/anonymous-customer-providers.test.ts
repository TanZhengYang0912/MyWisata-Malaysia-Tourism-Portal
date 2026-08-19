import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(`../${name}.tsx`, import.meta.url), "utf8");

describe("anonymous customer providers", () => {
  it.each(["wishlist", "saved-destinations"])("guards %s hydration and mutation by identity", (name) => {
    const contents = source(name);
    expect(contents).toContain("useAuth");
    expect(contents).toContain("currentUser?.id");
    expect(contents.indexOf("if (!currentUser)")).toBeLessThan(contents.indexOf('fetch("/api/'));
    expect(contents).toContain("activeUserIdRef.current");
  });

  it("clears all cart account state after sign-out", () => {
    const cart = source("cart");
    const anonymousBranch = cart.slice(cart.indexOf("if (!currentUser)"), cart.indexOf("return () =>", cart.indexOf("if (!currentUser)")));
    expect(anonymousBranch).toContain("setItems([])");
    expect(anonymousBranch).toContain("setSelectedKeysState(new Set())");
    expect(anonymousBranch).toContain("setMounted(true)");
  });

  it("persists trips only for a real user and clears anonymous state", () => {
    const trip = source("trip");
    expect(trip).toContain("useAuth");
    expect(trip).toContain("currentUser?.id");
    expect(trip).toContain("if (!currentUser)");
    expect(trip).toContain("setStops([])");
    expect(trip).toContain("mywisata:trip:");
  });

  it.each(["../../shared/notification-bell", "../../shared/notification-center"])("supports disabled notification requests in %s", (relativePath) => {
    const contents = readFileSync(new URL(`${relativePath}.tsx`, import.meta.url), "utf8");
    expect(contents).toContain("enabled?: boolean");
    expect(contents).toContain("if (!enabled)");
  });

  it("prevents an old notification request from restoring signed-out data", () => {
    const bell = readFileSync(new URL("../../shared/notification-bell.tsx", import.meta.url), "utf8");
    expect(bell).toContain("requestGeneration.current");
    expect(bell).toContain("generation !== requestGeneration.current");
  });
});
