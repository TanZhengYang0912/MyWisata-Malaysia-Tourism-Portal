import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const cardSource = readFileSync(resolve(workspace, "components/customer/activity-card.tsx"), "utf8");

describe("customer activity image handling", () => {
  it("shows a visible fallback when a cover is missing or fails to load", () => {
    expect(cardSource).toContain("const [imageFailed, setImageFailed] = useState(false)");
    expect(cardSource).toContain("onError={() => setImageFailed(true)}");
    expect(cardSource).toContain("!imageSrc || imageFailed");
    expect(cardSource).toContain('t("ui.labels.imageUnavailable")');
  });
});
