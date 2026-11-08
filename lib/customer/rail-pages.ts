/**
 * Turns a paged rail's scroll metrics into its page count and position. `pageStep` is one full page of cards.
 * When the cards do not divide evenly the last page is part-full: the rail cannot scroll a whole step there, so the
 * final partial stretch maps onto the last page and reaching the end of the rail always lights the last dot.
 */
export function railPagePosition(input: { scrollLeft: number; pageStep: number; scrollWidth: number; clientWidth: number }) {
  const { scrollLeft, pageStep, scrollWidth, clientWidth } = input;
  if (pageStep <= 0) return { pageCount: 1, progress: 0, page: 0 };

  // Tolerance absorbs subpixel layout rounding in scrollWidth.
  const pageCount = Math.max(1, Math.ceil(scrollWidth / pageStep - 0.01));
  const lastPage = pageCount - 1;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const lastStart = Math.max(0, lastPage - 1) * pageStep;

  let progress: number;
  if (lastPage === 0) progress = 0;
  else if (scrollLeft >= maxScroll - 1) progress = lastPage;
  else if (scrollLeft > lastStart) progress = lastPage - 1 + (scrollLeft - lastStart) / (maxScroll - lastStart);
  else progress = Math.max(0, scrollLeft / pageStep);

  return { pageCount, progress, page: Math.round(progress) };
}
