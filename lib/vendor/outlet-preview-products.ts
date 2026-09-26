export interface OutletPreviewProductPage<T> {
  items: T[];
  totalPages: number;
}

export async function loadOutletPreviewProductPages<T extends { id: string }>(
  fetchPage: (page: number) => Promise<OutletPreviewProductPage<T>>,
): Promise<T[]> {
  const firstPage = await fetchPage(1);
  const totalPages = Number.isSafeInteger(firstPage.totalPages) && firstPage.totalPages > 0
    ? firstPage.totalPages
    : 1;
  const items = [...firstPage.items];

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await fetchPage(page);
    items.push(...result.items);
  }

  const seenIds = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });
}
