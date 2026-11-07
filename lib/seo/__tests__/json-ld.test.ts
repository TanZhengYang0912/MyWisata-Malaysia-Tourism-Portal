import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/seo/json-ld";

describe("serializeJsonLd", () => {
  it("cannot be used to close the script tag", () => {
    const attack = { name: "Kedai", description: "</script><script>alert(document.cookie)</script>" };
    const out = serializeJsonLd(attack);

    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(attack);
  });

  it("keeps ampersands and line separators valid and round-trippable", () => {
    const data = { name: "Tom & Jerry's\u2028Cafe\u2029", url: "https://x.example/?a=1&b=2" };
    const out = serializeJsonLd(data);

    expect(out).not.toMatch(/[&\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(data);
  });

  it("is used by every JSON-LD script tag", () => {
    for (const file of [
      "app/customer/vendor/[vendorId]/page.tsx",
      "components/outlet/public-outlet-page.tsx",
      "app/help/[slug]/page.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("__html: serializeJsonLd(jsonLd)");
      expect(source, file).not.toContain("__html: JSON.stringify(");
    }
  });
});
