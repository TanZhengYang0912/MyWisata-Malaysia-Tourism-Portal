import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("public customer mutation gates", () => {
  it.each([
    ["activity-card.tsx", "async function handleSave", "ACCOUNT_MUTATION", "await toggleSaved"],
    ["saved-destination-card.tsx", "async function removeSavedDestination", "ACCOUNT_MUTATION", "await toggleSaved"],
    ["outlet-chat-button.tsx", "async function handleChat", "ACCOUNT_MUTATION", 'await fetch("/api/customer/chat"'],
  ])("guards %s before its mutation", (name, handlerName, capability, mutation) => {
    const source = read(name);
    const handler = source.slice(source.indexOf(handlerName));
    expect(handler).toContain(`CUSTOMER_CAPABILITY.${capability}`);
    expect(handler.indexOf(`CUSTOMER_CAPABILITY.${capability}`))
      .toBeLessThan(handler.indexOf(mutation));
  });

  it("guards the homepage destination save", () => {
    const source = readFileSync(new URL("../../../app/customer/design-demo/design-demo-client.tsx", import.meta.url), "utf8");
    expect(source).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
    expect(source.indexOf("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION"))
      .toBeLessThan(source.indexOf("toggleSaved(activeDestination.state)"));
  });
});
