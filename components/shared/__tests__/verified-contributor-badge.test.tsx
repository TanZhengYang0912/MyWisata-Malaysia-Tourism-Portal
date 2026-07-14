import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";

describe("VerifiedContributorBadge", () => {
  it("renders an accessible badge only for verified contributors", () => {
    const markup = renderToStaticMarkup(<VerifiedContributorBadge verified={true} />);

    expect(markup).toContain("Verified Contributor");
    expect(markup).toContain('aria-label="Verified Contributor"');
  });

  it("renders nothing for an unverified contributor", () => {
    expect(renderToStaticMarkup(<VerifiedContributorBadge verified={false} />)).toBe("");
  });
});
