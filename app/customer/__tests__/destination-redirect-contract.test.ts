import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("destination Explore redirects", () => {
  it("routes every shared destination preview CTA to the destination detail page", () => {
    const customerHomeSource = read("app/customer/customer-home-client.tsx");
    const homeSource = read("app/customer/home-client.tsx");
    const designDemoSource = read("app/customer/design-demo/design-demo-client.tsx");

    expect(customerHomeSource).toContain("destinationHref(previewDestination.state)");
    expect(customerHomeSource).not.toContain("/customer/explore?state=");
    expect(homeSource).toContain("destinationHref(destinationState)");
    expect(designDemoSource).toContain("destinationHref(state)");
    expect(designDemoSource).not.toContain("router.push(`/customer?state=");
  });
});
