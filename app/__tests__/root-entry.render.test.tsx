import React, { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument } from "@/components/shared/__tests__/render-test-dom";

const replace = vi.fn();
const auth = vi.hoisted(() => ({ currentUser: null as { role: string } | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: auth.currentUser, loading: false }) }));

describe("root entry", () => {
  let document: TestDocument;
  beforeAll(() => { document = installTestDom(); });

  async function renderAs(user: { role: string } | null) {
    replace.mockClear();
    auth.currentUser = user;
    const { createRoot } = await import("react-dom/client");
    const { default: RootEntry } = await import("@/app/page");
    const container = document.createElement("div");
    const root = createRoot(container as unknown as Element);
    await act(async () => { root.render(<RootEntry />); });
    act(() => root.unmount());
  }

  it("sends guests to the customer Home page", async () => {
    await renderAs(null);
    expect(replace).toHaveBeenCalledWith("/customer");
  });

  it("keeps sending signed-in users to their role home", async () => {
    await renderAs({ role: "vendor_owner" });
    expect(replace).toHaveBeenCalledWith("/vendor/announcements");
  });
});
