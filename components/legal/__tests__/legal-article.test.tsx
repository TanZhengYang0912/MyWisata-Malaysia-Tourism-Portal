import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LegalArticle } from "../legal-article";

describe("LegalArticle paragraphs", () => {
  it("renders each line of the intro and of a section body as its own paragraph", () => {
    const markup = renderToStaticMarkup(
      <LegalArticle
        title="About"
        intro={"First intro line.\nSecond intro line."}
        updated="Updated"
        sections={[{ heading: "Company", body: "Operates under:\nMES EVENT MANAGEMENT\nRegistration No.: KT0624597-M" }]}
      />,
    );
    expect(markup).toContain("<p>First intro line.</p>");
    expect(markup).toContain("<p>Second intro line.</p>");
    expect(markup).toContain("<p>MES EVENT MANAGEMENT</p>");
    expect(markup).toContain("<p>Registration No.: KT0624597-M</p>");
  });

  it("keeps a single-line intro as one paragraph", () => {
    const markup = renderToStaticMarkup(<LegalArticle title="Privacy" intro="Only line." updated="Updated" sections={[]} />);
    expect(markup.match(/<p>Only line\.<\/p>/g)).toHaveLength(1);
  });
});
