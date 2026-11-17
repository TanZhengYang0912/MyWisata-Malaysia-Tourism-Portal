export interface LegalSection {
  heading: string;
  body: string;
}

// Presentational renderer shared by all four legal pages. Bodies are single i18n
// strings split on newlines into paragraphs, so a multi-paragraph section stays
// one translation key rather than one key per paragraph.
export function LegalArticle({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <article>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{updated}</p>
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-foreground">
          {intro.split(/\n+/).map((para, paraIndex) => (
            <p key={paraIndex}>{para.trim()}</p>
          ))}
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((section, index) => (
            <section key={index}>
              <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
              <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground">
                {section.body.split(/\n+/).map((para, paraIndex) => (
                  <p key={paraIndex}>{para.trim()}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
