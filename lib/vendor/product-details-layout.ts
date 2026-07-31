export function getProductDetailsLayoutClasses() {
  return {
    page: 'mx-auto max-w-6xl space-y-6',
    content: 'space-y-6',
    actions: 'sticky top-4 z-10',
    pricing: 'mt-6',
  } as const;
}
